"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// -----------------------------------------------------------------------------
// Hunt configuration — change these values for your deployment / playtests
// -----------------------------------------------------------------------------
/** Target latitude (decimal degrees, WGS84) */
const TARGET_LATITUDE = -33.741074;
/** Target longitude (decimal degrees, WGS84) */
const TARGET_LONGITUDE = 18.963577;
/** User must be within this radius (meters) before the AR view unlocks */
const UNLOCK_RADIUS_METERS = 5000;

// -----------------------------------------------------------------------------
// GLB — must match `public/character.glb` → URL `/character.glb`
// -----------------------------------------------------------------------------
const CHARACTER_MODEL_SRC = "/character.glb";
const CHARACTER_MODEL_ASSET_ID = "characterModel";

/** GPS mode: model at anchor */
const CHARACTER_MODEL_SCALE = "0.5 0.5 0.5";
const CHARACTER_MODEL_ROTATION = "0 180 0";
const CHARACTER_MODEL_POSITION = "0 0 0";
const COLLECT_LABEL_POSITION = "0 2 0";
const COLLECT_LABEL_SCALE = "5 5 5";
const COLLECT_LABEL_COLOR = "#FFFFFF";

/** Test mode: rig in front of camera (no GPS anchoring) */
const TEST_MODEL_ANCHOR_POSITION = "0 0 -4";
const TEST_MODEL_SCALE = "2 2 2";
const TEST_MODEL_ROTATION = "0 180 0";
/** Applied to fallback sphere in test mode (large + bright) */
const TEST_SPHERE_SCALE = "2 2 2";
const TEST_FALLBACK_SPHERE_RADIUS = "2";

/** Big GLB diagnostic (camera space, no GPS) */
const DIAG_MODEL_POSITION = "0 -1 -3";
const DIAG_MODEL_SCALE = "10 10 10";
const DIAG_MODEL_ROTATION = "0 180 0";
const DIAG_SPHERE_POSITION = "1 0 -3";
const DIAG_BOX_POSITION = "-1 0 -3";
const DIAG_AMBIENT_INTENSITY = 2;
const DIAG_DIRECTIONAL_INTENSITY = 2;

const MODEL_LOAD_TIMEOUT_MS = 10_000;
/** If `scene` never fires `loaded` (common on some mobile WebKit builds), still show AR */
const SCENE_LOAD_FALLBACK_MS = 6000;
/** Replace AR-prep spinner with detailed status text */
const AR_PREP_SPINNER_REPLACE_MS = 5000;

const AR_JS_URL =
  "https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.3.2/aframe/build/aframe-ar.js";
const AFRAME_URL = "https://aframe.io/releases/1.4.2/aframe.min.js";

type ArRenderingMode = "gps" | "test" | "diagnostic";

type ArDebugOverlay = {
  camera: "loading" | "ready" | "error";
  arScripts: "loading" | "loaded" | "error";
  model: "loading" | "loaded" | "error";
  gpsAnchor: "active" | "off";
  modeLabel:
    | "GPS mode"
    | "Test mode"
    | "Diagnostic (big model)";
  modelVisibleError: string | null;
  modelUrlStatus: "pending" | "loaded" | "failed";
  modelBoundsInfo: string | null;
  modelLoadErrorDetail: string | null;
};

const initialArDebug: ArDebugOverlay = {
  camera: "loading",
  arScripts: "loading",
  model: "loading",
  gpsAnchor: "off",
  modeLabel: "GPS mode",
  modelVisibleError: null,
  modelUrlStatus: "pending",
  modelBoundsInfo: null,
  modelLoadErrorDetail: null,
};

function formatModelErrorDetail(ev: Event): string {
  if ("detail" in ev && (ev as CustomEvent).detail != null) {
    try {
      return JSON.stringify((ev as CustomEvent).detail);
    } catch {
      return String((ev as CustomEvent).detail);
    }
  }
  return String(ev);
}

function computeGltfBoundsString(modelEl: HTMLElement): string {
  const w = window as unknown as {
    AFRAME?: { THREE?: Record<string, unknown> };
    THREE?: Record<string, unknown>;
  };
  const THREE = w.AFRAME?.THREE ?? w.THREE;
  const obj = (modelEl as unknown as { object3D?: object }).object3D;
  if (!THREE || !obj) {
    return "n/a (THREE or object3D not ready)";
  }
  try {
    const T = THREE as unknown as {
      Box3: new () => {
        setFromObject: (o: object) => void;
        getSize: (v: object) => { x: number; y: number; z: number };
      };
      Vector3: new () => object;
    };
    const box = new T.Box3();
    box.setFromObject(obj as object);
    const size = box.getSize(new T.Vector3());
    return `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} (units)`;
  } catch {
    return "n/a (bbox failed)";
  }
}

/** Haversine distance in meters between two WGS84 points */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("document unavailable"));
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(src)), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

type Phase =
  | "intro"
  | "locating"
  | "too_far"
  | "ar_prep"
  | "ar"
  | "success"
  | "error_loc"
  | "error_cam"
  | "ar_stalled";

const INSECURE_CONTEXT_WARNING =
  "Camera and location usually require HTTPS on mobile. Use a deployed HTTPS URL or a tunnel like localtunnel/ngrok.";

/** AR.js camera feed + A-Frame stacking (iOS Safari often needs explicit z-index / sizing) */
function applyArJsVideoLayering(sceneEl: HTMLElement, _hostEl: HTMLElement) {
  document.querySelectorAll("video").forEach((node) => {
    if (node.id === "ar-raw-camera-video") return;
    const v = node as HTMLVideoElement;
    const s = v.style;
    s.setProperty("position", "fixed");
    s.setProperty("inset", "0");
    s.setProperty("width", "100vw");
    s.setProperty("height", "100vh");
    s.setProperty("object-fit", "cover");
    s.setProperty("z-index", "0");
    s.setProperty("opacity", "1");
    s.setProperty("visibility", "visible");
    s.setProperty("display", "block");
  });

  const s = sceneEl.style;
  s.setProperty("position", "fixed");
  s.setProperty("inset", "0");
  s.setProperty("width", "100vw");
  s.setProperty("height", "100vh");
  s.setProperty("z-index", "1");
  s.setProperty("background", "transparent");

  sceneEl.querySelectorAll("canvas").forEach((node) => {
    const c = node as HTMLCanvasElement;
    const cs = c.style;
    cs.setProperty("position", "fixed");
    cs.setProperty("inset", "0");
    cs.setProperty("width", "100vw");
    cs.setProperty("height", "100vh");
    cs.setProperty("z-index", "2");
    cs.setProperty("pointer-events", "auto");
    cs.setProperty("background", "transparent");
  });
}

export default function ArTestPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [statusLine, setStatusLine] = useState<string>(
    "Ready. Tap Start AR Hunt when you’re set.",
  );
  const [isSecureContext, setIsSecureContext] = useState<boolean | null>(null);
  const [locationErrorDetail, setLocationErrorDetail] = useState<string | null>(
    null,
  );
  const [cameraErrorDetail, setCameraErrorDetail] = useState<string | null>(
    null,
  );

  const [arRenderingMode, setArRenderingMode] =
    useState<ArRenderingMode>("gps");
  const [arDebug, setArDebug] = useState<ArDebugOverlay>(initialArDebug);
  const [geoSnapshot, setGeoSnapshot] = useState<{
    lat: number;
    lon: number;
    dist: number;
  } | null>(null);
  const [arPrepShowDetail, setArPrepShowDetail] = useState(false);
  const [rawCameraMode, setRawCameraMode] = useState(false);
  const [videoProbe, setVideoProbe] = useState<{
    count: number;
    ready: string;
    dim: string;
  }>({ count: 0, ready: "—", dim: "—" });

  const sceneHostRef = useRef<HTMLDivElement | null>(null);
  const rawVideoRef = useRef<HTMLVideoElement | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const lastArModeRef = useRef<ArRenderingMode>("test");
  const videoLayerObserverRef = useRef<MutationObserver | null>(null);
  /** Set when `mountScene("test")` builds camera-relative rig (for “Show fallback sphere”) */
  const testSceneElsRef = useRef<{
    modelEntity: HTMLElement;
    sphere: HTMLElement;
  } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const scriptsPromiseRef = useRef<Promise<void> | null>(null);
  const distanceRef = useRef<number>(Infinity);
  const phaseRef = useRef<Phase>("intro");
  const enteringArRef = useRef(false);
  const cameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchArDebug = useCallback((p: Partial<ArDebugOverlay>) => {
    setArDebug((prev) => ({ ...prev, ...p }));
  }, []);

  phaseRef.current = phase;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const secure = window.isSecureContext;
    console.log("[ar-test] Secure context:", secure);
    setIsSecureContext(secure);
  }, []);

  useEffect(() => {
    if (phase !== "ar_prep") {
      setArPrepShowDetail(false);
      return;
    }
    const t = window.setTimeout(() => {
      setArPrepShowDetail(true);
    }, AR_PREP_SPINNER_REPLACE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const clearCameraTimeout = useCallback(() => {
    if (cameraTimeoutRef.current !== null) {
      clearTimeout(cameraTimeoutRef.current);
      cameraTimeoutRef.current = null;
    }
  }, []);

  const destroyScene = useCallback(() => {
    clearCameraTimeout();
    videoLayerObserverRef.current?.disconnect();
    videoLayerObserverRef.current = null;
    testSceneElsRef.current = null;
    const host = sceneHostRef.current;
    if (host) {
      host.innerHTML = "";
    }
  }, [clearCameraTimeout]);

  const ensureArScripts = useCallback(async () => {
    patchArDebug({ arScripts: "loading" });
    setStatusLine("Loading AR scripts…");
    if (!scriptsPromiseRef.current) {
      scriptsPromiseRef.current = (async () => {
        await loadScript(AFRAME_URL);
        console.log("[ar-test] A-Frame loaded");
        await loadScript(AR_JS_URL);
        console.log("[ar-test] AR.js loaded");
      })();
    }
    try {
      await scriptsPromiseRef.current;
      patchArDebug({ arScripts: "loaded" });
      console.log("[ar-test] AR scripts ready (both)");
    } catch (e) {
      patchArDebug({ arScripts: "error" });
      console.error("[ar-test] AR scripts failed", e);
      throw e;
    }
  }, [patchArDebug]);

  const handleCollected = useCallback(() => {
    destroyScene();
    setPhase("success");
  }, [destroyScene]);

  const collectHandlerRef = useRef(handleCollected);
  collectHandlerRef.current = handleCollected;

  const mountScene = useCallback(
    (mode: ArRenderingMode) => {
      const host = sceneHostRef.current;
      if (!host) return;

      lastArModeRef.current = mode;
      host.innerHTML = "";
      videoLayerObserverRef.current?.disconnect();
      videoLayerObserverRef.current = null;
      patchArDebug({
        model: "loading",
        modelVisibleError: null,
        modelUrlStatus: "pending",
        modelBoundsInfo: null,
        modelLoadErrorDetail: null,
        modeLabel:
          mode === "diagnostic"
            ? "Diagnostic (big model)"
            : mode === "test"
              ? "Test mode"
              : "GPS mode",
        gpsAnchor: mode === "gps" ? "active" : "off",
      });

      const scene = document.createElement("a-scene");
      scene.setAttribute("embedded", "");
      scene.setAttribute("vr-mode-ui", "enabled: false");
      scene.setAttribute(
        "arjs",
        "sourceType: webcam; videoTexture: true; debugUIEnabled: false;",
      );
      scene.setAttribute(
        "renderer",
        "logarithmicDepthBuffer: true; antialias: true;",
      );
      scene.setAttribute("loading-screen", "enabled: false");

      console.log("[ar-test] Scene created", { mode });

      const assets = document.createElement("a-assets");
      const assetItem = document.createElement("a-asset-item");
      assetItem.setAttribute("id", CHARACTER_MODEL_ASSET_ID);
      assetItem.setAttribute("src", CHARACTER_MODEL_SRC);
      assets.appendChild(assetItem);

      const camera = document.createElement("a-camera");
      camera.setAttribute("gps-camera", "");
      camera.setAttribute("rotation-reader", "");

      const cursor = document.createElement("a-entity");
      cursor.setAttribute("cursor", "fuse: false; rayOrigin: mouse");
      cursor.setAttribute("position", "0 0 -1");
      cursor.setAttribute(
        "geometry",
        "primitive: ring; radiusInner: 0.02; radiusOuter: 0.03",
      );
      cursor.setAttribute("material", "color: #ffffff; shader: flat");
      cursor.setAttribute("raycaster", "objects: .clickable");
      camera.appendChild(cursor);

      const gpsPlace = `latitude: ${TARGET_LATITUDE}; longitude: ${TARGET_LONGITUDE}`;

      const modelEntity = document.createElement("a-entity");
      modelEntity.id = "ar-object";
      modelEntity.setAttribute("gltf-model", `#${CHARACTER_MODEL_ASSET_ID}`);
      console.log("[ar-test] Model requested", CHARACTER_MODEL_SRC);
      modelEntity.setAttribute("class", "clickable");
      modelEntity.setAttribute("visible", "true");

      const sphere = document.createElement("a-sphere");
      sphere.setAttribute(
        "material",
        "color: #22ffc8; metalness: 0.2; roughness: 0.35; emissive: #00ffcc; emissiveIntensity: 0.85",
      );
      sphere.setAttribute("class", "clickable");

      const label = document.createElement("a-text");
      label.setAttribute("value", "Tap to collect");
      label.setAttribute("align", "center");
      label.setAttribute("color", COLLECT_LABEL_COLOR);

      let diagBox: HTMLElement | null = null;
      let ambientEnt: HTMLElement | null = null;
      let directionalEnt: HTMLElement | null = null;

      if (mode === "gps") {
        modelEntity.setAttribute("scale", CHARACTER_MODEL_SCALE);
        modelEntity.setAttribute("rotation", CHARACTER_MODEL_ROTATION);
        modelEntity.setAttribute("gps-entity-place", gpsPlace);
        modelEntity.setAttribute("position", CHARACTER_MODEL_POSITION);
        sphere.setAttribute("radius", "2");
        sphere.setAttribute("visible", "false");
        sphere.setAttribute("gps-entity-place", gpsPlace);
        sphere.setAttribute("position", CHARACTER_MODEL_POSITION);
        label.setAttribute("position", COLLECT_LABEL_POSITION);
        label.setAttribute("scale", COLLECT_LABEL_SCALE);
        label.setAttribute("gps-entity-place", gpsPlace);
      } else if (mode === "test") {
        modelEntity.setAttribute("scale", TEST_MODEL_SCALE);
        modelEntity.setAttribute("rotation", TEST_MODEL_ROTATION);
        sphere.setAttribute("radius", TEST_FALLBACK_SPHERE_RADIUS);
        sphere.setAttribute("visible", "false");
        sphere.setAttribute("scale", TEST_SPHERE_SCALE);
        label.setAttribute("position", COLLECT_LABEL_POSITION);
        label.setAttribute("scale", COLLECT_LABEL_SCALE);
      } else {
        modelEntity.setAttribute("position", DIAG_MODEL_POSITION);
        modelEntity.setAttribute("scale", DIAG_MODEL_SCALE);
        modelEntity.setAttribute("rotation", DIAG_MODEL_ROTATION);
        sphere.setAttribute("radius", "0.55");
        sphere.setAttribute("position", DIAG_SPHERE_POSITION);
        sphere.setAttribute("visible", "true");
        sphere.setAttribute("scale", "1 1 1");
        label.setAttribute("position", "0 1.2 -3");
        label.setAttribute("scale", "8 8 8");
        diagBox = document.createElement("a-box");
        diagBox.setAttribute("position", DIAG_BOX_POSITION);
        diagBox.setAttribute("width", "0.7");
        diagBox.setAttribute("height", "0.7");
        diagBox.setAttribute("depth", "0.7");
        diagBox.setAttribute("color", "#ff3333");
        diagBox.setAttribute("class", "clickable");
        ambientEnt = document.createElement("a-entity");
        ambientEnt.setAttribute(
          "light",
          `type: ambient; color: #ffffff; intensity: ${DIAG_AMBIENT_INTENSITY}`,
        );
        directionalEnt = document.createElement("a-entity");
        directionalEnt.setAttribute(
          "light",
          `type: directional; color: #ffffff; intensity: ${DIAG_DIRECTIONAL_INTENSITY}`,
        );
        directionalEnt.setAttribute("position", "0 6 4");
      }

      const onCollectClick = (ev: Event) => {
        ev.stopPropagation();
        collectHandlerRef.current();
      };
      modelEntity.addEventListener("click", onCollectClick);
      sphere.addEventListener("click", onCollectClick);
      if (diagBox) {
        diagBox.addEventListener("click", onCollectClick);
      }

      if (mode === "test") {
        const rig = document.createElement("a-entity");
        rig.setAttribute("position", TEST_MODEL_ANCHOR_POSITION);
        rig.setAttribute("id", "camera-space-rig");
        modelEntity.setAttribute("position", "0 0 0");
        sphere.setAttribute("position", "0 0 0");
        rig.appendChild(modelEntity);
        rig.appendChild(sphere);
        rig.appendChild(label);
        camera.appendChild(rig);
        testSceneElsRef.current = { modelEntity, sphere };
      } else if (mode === "diagnostic") {
        camera.appendChild(modelEntity);
        camera.appendChild(sphere);
        if (diagBox) {
          camera.appendChild(diagBox);
        }
        camera.appendChild(label);
        testSceneElsRef.current = { modelEntity, sphere };
      }

      let modelLoadSettled = false;
      let fallbackTimer: number;

      const activateSphereFallback = (reason: string, errorDetail?: string) => {
        window.clearTimeout(fallbackTimer);
        if (modelLoadSettled) return;
        modelLoadSettled = true;
        console.error("[ar-test] Model error / timeout — fallback sphere", reason);
        if (mode === "diagnostic") {
          const msg = `GLB failed (${reason}). Red box + cyan sphere still visible for render test.`;
          patchArDebug({
            model: "error",
            modelUrlStatus: "failed",
            modelLoadErrorDetail: errorDetail ?? reason,
            modelVisibleError: msg,
          });
          modelEntity.setAttribute("visible", "false");
          return;
        }
        const msg = `Model did not load (${reason}). Using sphere fallback.`;
        patchArDebug({
          model: "error",
          modelUrlStatus: "failed",
          modelLoadErrorDetail: errorDetail ?? reason,
          modelVisibleError: msg,
        });
        modelEntity.setAttribute("visible", "false");
        sphere.setAttribute("visible", "true");
        if (mode === "test") {
          sphere.setAttribute("position", "0 0 0");
          sphere.setAttribute("scale", TEST_SPHERE_SCALE);
        }
      };

      fallbackTimer = window.setTimeout(() => {
        if (!modelLoadSettled) {
          activateSphereFallback(`timeout ${MODEL_LOAD_TIMEOUT_MS}ms`);
        }
      }, MODEL_LOAD_TIMEOUT_MS) as unknown as number;

      modelEntity.addEventListener(
        "model-loaded",
        () => {
          window.clearTimeout(fallbackTimer);
          modelLoadSettled = true;
          if (mode !== "diagnostic") {
            sphere.setAttribute("visible", "false");
          }
          patchArDebug({
            model: "loaded",
            modelUrlStatus: "loaded",
            modelVisibleError: null,
            modelLoadErrorDetail: null,
          });
          console.log("[ar-test] Model loaded", CHARACTER_MODEL_SRC);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              const bounds = computeGltfBoundsString(modelEntity);
              patchArDebug({ modelBoundsInfo: bounds });
            });
          });
        },
        { once: true },
      );
      modelEntity.addEventListener(
        "model-error",
        (ev) => {
          const detail = formatModelErrorDetail(ev);
          console.error(
            "[ar-test] Model error",
            CHARACTER_MODEL_SRC,
            detail,
            ev,
          );
          patchArDebug({
            modelUrlStatus: "failed",
            modelLoadErrorDetail: detail,
          });
          if (mode === "diagnostic") {
            window.clearTimeout(fallbackTimer);
            modelLoadSettled = true;
            modelEntity.setAttribute("visible", "false");
            patchArDebug({
              model: "error",
              modelVisibleError: `GLB error: ${detail}`,
            });
            return;
          }
          activateSphereFallback("model-error", detail);
        },
        { once: true },
      );

      scene.appendChild(assets);
      if (ambientEnt && directionalEnt) {
        scene.appendChild(ambientEnt);
        scene.appendChild(directionalEnt);
      }
      scene.appendChild(camera);
      if (mode === "gps") {
        scene.appendChild(modelEntity);
        scene.appendChild(sphere);
        scene.appendChild(label);
      }

      let sceneUiSettled = false;
      let sceneFallbackTimer: number;

      const sealArView = (from: string) => {
        if (sceneUiSettled) return;
        sceneUiSettled = true;
        window.clearTimeout(sceneFallbackTimer);
        clearCameraTimeout();
        console.log("[ar-test] Scene loaded", { from });
        applyArJsVideoLayering(scene as unknown as HTMLElement, host);
        window.requestAnimationFrame(() => {
          applyArJsVideoLayering(scene as unknown as HTMLElement, host);
          window.setTimeout(() => {
            applyArJsVideoLayering(scene as unknown as HTMLElement, host);
          }, 120);
        });
        setPhase("ar");
      };

      sceneFallbackTimer = window.setTimeout(() => {
        if (!sceneUiSettled && phaseRef.current === "ar_prep") {
          console.warn(
            "[ar-test] Scene `loaded` event did not fire; forcing AR view open",
          );
          sealArView("loaded-fallback-timer");
        }
      }, SCENE_LOAD_FALLBACK_MS) as unknown as number;

      scene.addEventListener("loaded", () => {
        if (phaseRef.current !== "ar_prep") return;
        sealArView("loaded-event");
      });

      cameraTimeoutRef.current = setTimeout(() => {
        if (!sceneUiSettled && phaseRef.current === "ar_prep") {
          window.clearTimeout(sceneFallbackTimer);
          destroyScene();
          setPhase("ar_stalled");
        }
      }, 18000);

      host.appendChild(scene);

      const sceneEl = scene as unknown as HTMLElement;
      applyArJsVideoLayering(sceneEl, host);
      const runLayering = () => applyArJsVideoLayering(sceneEl, host);
      window.requestAnimationFrame(() => {
        runLayering();
        window.requestAnimationFrame(runLayering);
      });
      window.setTimeout(runLayering, 50);
      window.setTimeout(runLayering, 300);
      window.setTimeout(runLayering, 1000);

      const mo = new MutationObserver(runLayering);
      mo.observe(host, { subtree: true, childList: true, attributes: true });
      videoLayerObserverRef.current = mo;

      scene.addEventListener("loaded", runLayering);
      scene.addEventListener("renderstart", runLayering as EventListener);
    },
    [clearCameraTimeout, destroyScene, patchArDebug],
  );

  const teardownAr = useCallback(() => {
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    setRawCameraMode(false);
    enteringArRef.current = false;
    destroyScene();
  }, [destroyScene]);

  const tryEnterAr = useCallback(async () => {
    if (
      phaseRef.current === "ar" ||
      phaseRef.current === "ar_prep" ||
      enteringArRef.current
    ) {
      return;
    }
    if (distanceRef.current > UNLOCK_RADIUS_METERS) {
      return;
    }

    enteringArRef.current = true;
    setArRenderingMode("gps");
    setArDebug({
      ...initialArDebug,
      modeLabel: "GPS mode",
      gpsAnchor: "active",
    });
    setPhase("ar_prep");
    patchArDebug({ camera: "loading" });

    try {
      await ensureArScripts();

      if (distanceRef.current > UNLOCK_RADIUS_METERS) {
        teardownAr();
        setPhase("too_far");
        enteringArRef.current = false;
        return;
      }

      try {
        console.log("[ar-test] Requesting camera");
        setStatusLine("Requesting camera…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        console.log("[ar-test] Camera success");
        patchArDebug({ camera: "ready" });
        setStatusLine("Camera allowed. Starting AR scene…");
        stream.getTracks().forEach((t) => t.stop());
      } catch (camErr) {
        const detail =
          camErr instanceof Error
            ? `${camErr.name}: ${camErr.message}`
            : String(camErr);
        console.log("[ar-test] Camera error", detail);
        patchArDebug({ camera: "error" });
        setCameraErrorDetail(detail);
        setPhase("error_cam");
        enteringArRef.current = false;
        return;
      }

      if (distanceRef.current > UNLOCK_RADIUS_METERS) {
        teardownAr();
        setPhase("too_far");
        enteringArRef.current = false;
        return;
      }

      console.log("[ar-test] GPS mode activated");
      mountScene("gps");
    } catch (outer) {
      const detail =
        outer instanceof Error
          ? `${outer.name}: ${outer.message}`
          : String(outer);
      console.log("[ar-test] Camera error (outer)", detail);
      patchArDebug({ camera: "error", arScripts: "error" });
      setCameraErrorDetail(detail);
      setPhase("error_cam");
    } finally {
      enteringArRef.current = false;
    }
  }, [ensureArScripts, mountScene, patchArDebug, teardownAr]);

  const switchToTestMode = useCallback(async () => {
    console.log("[ar-test] Test mode activated");
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    setRawCameraMode(false);
    setArRenderingMode("test");
    destroyScene();
    setPhase("ar_prep");
    setArDebug({
      ...initialArDebug,
      modeLabel: "Test mode",
      gpsAnchor: "off",
      camera: "loading",
    });
    patchArDebug({ arScripts: "loading" });
    try {
      await ensureArScripts();

      try {
        console.log("[ar-test] Requesting camera (test mode)");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        stream.getTracks().forEach((t) => t.stop());
        patchArDebug({ camera: "ready" });
        console.log("[ar-test] Camera success (test mode)");
      } catch (camErr) {
        const detail =
          camErr instanceof Error
            ? `${camErr.name}: ${camErr.message}`
            : String(camErr);
        console.error("[ar-test] Camera error (test mode)", detail);
        patchArDebug({ camera: "error" });
        setCameraErrorDetail(detail);
        setPhase("error_cam");
        return;
      }

      mountScene("test");
    } catch (e) {
      console.error("[ar-test] Test mode script load failed", e);
      patchArDebug({ arScripts: "error" });
      setPhase("error_cam");
      setCameraErrorDetail(
        e instanceof Error ? e.message : "Failed to load AR scripts",
      );
    }
  }, [destroyScene, ensureArScripts, mountScene, patchArDebug]);

  const showBigDiagnosticModel = useCallback(async () => {
    console.log("[ar-test] Show big test model (diagnostic mode)");
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    setRawCameraMode(false);
    setArRenderingMode("diagnostic");
    destroyScene();
    setPhase("ar_prep");
    setArDebug({
      ...initialArDebug,
      modeLabel: "Diagnostic (big model)",
      gpsAnchor: "off",
      camera: "loading",
    });
    patchArDebug({ arScripts: "loading" });
    try {
      await ensureArScripts();

      try {
        console.log("[ar-test] Requesting camera (diagnostic mode)");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        stream.getTracks().forEach((t) => t.stop());
        patchArDebug({ camera: "ready" });
        console.log("[ar-test] Camera success (diagnostic mode)");
      } catch (camErr) {
        const detail =
          camErr instanceof Error
            ? `${camErr.name}: ${camErr.message}`
            : String(camErr);
        console.error("[ar-test] Camera error (diagnostic mode)", detail);
        patchArDebug({ camera: "error" });
        setCameraErrorDetail(detail);
        setPhase("error_cam");
        return;
      }

      mountScene("diagnostic");
    } catch (e) {
      console.error("[ar-test] Diagnostic mode script load failed", e);
      patchArDebug({ arScripts: "error" });
      setPhase("error_cam");
      setCameraErrorDetail(
        e instanceof Error ? e.message : "Failed to load AR scripts",
      );
    }
  }, [destroyScene, ensureArScripts, mountScene, patchArDebug]);

  const showFallbackSphereOnly = useCallback(() => {
    const els = testSceneElsRef.current;
    if (!els) {
      console.warn(
        "[ar-test] Show fallback sphere: no camera rig — use test or diagnostic first",
      );
      return;
    }
    console.log("[ar-test] Show fallback sphere (manual)");
    els.modelEntity.setAttribute("visible", "false");
    els.sphere.setAttribute("visible", "true");
    if (arRenderingMode === "diagnostic") {
      els.sphere.setAttribute("position", DIAG_SPHERE_POSITION);
      els.sphere.setAttribute("scale", "2 2 2");
      patchArDebug({
        model: "error",
        modelVisibleError:
          "Manual: sphere only at (1, 0, -3), scale 2 — red box still visible.",
      });
    } else {
      els.sphere.setAttribute("position", "0 0 0");
      els.sphere.setAttribute("scale", TEST_SPHERE_SCALE);
      patchArDebug({
        model: "error",
        modelVisibleError:
          "Manual: bright sphere at camera rig (0 0 -4), scale 2 2 2.",
      });
    }
  }, [arRenderingMode, patchArDebug]);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startHunt = useCallback(() => {
    if (!navigator.geolocation) {
      const detail = "Geolocation API not available in this browser.";
      console.log("[ar-test] Location error", detail);
      setLocationErrorDetail(detail);
      setPhase("error_loc");
      return;
    }

    console.log("[ar-test] Requesting location");
    setStatusLine("Requesting location…");
    setPhase("locating");
    setDistanceMeters(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const d = haversineMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          TARGET_LATITUDE,
          TARGET_LONGITUDE,
        );
        const rounded = Math.max(0, Math.round(d));
        console.log("[ar-test] Location success", {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        console.log("[ar-test] Distance calculated", rounded, "m");
        distanceRef.current = d;
        setDistanceMeters(rounded);
        setGeoSnapshot({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          dist: rounded,
        });
        setStatusLine(`Distance: ${rounded} m (unlock ≤ ${UNLOCK_RADIUS_METERS} m)`);

        const inside = d <= UNLOCK_RADIUS_METERS;
        const p = phaseRef.current;

        if (!inside) {
          if (p === "ar" || p === "ar_prep") {
            teardownAr();
            setPhase("too_far");
          } else if (p === "locating") {
            setPhase("too_far");
          } else if (p === "too_far") {
            /* stay */
          }
          return;
        }

        if (p === "too_far" || p === "locating") {
          void tryEnterAr();
        }
      },
      (err) => {
        const detail = `code ${err.code} (${err.code === 1 ? "PERMISSION_DENIED" : err.code === 2 ? "POSITION_UNAVAILABLE" : err.code === 3 ? "TIMEOUT" : "UNKNOWN"}): ${err.message}`;
        console.log("[ar-test] Location error", detail);
        setLocationErrorDetail(detail);
        setPhase("error_loc");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 27000,
      },
    );
  }, [teardownAr, tryEnterAr]);

  const handleStartClick = useCallback(() => {
    console.log("[ar-test] Start button clicked");
    if (typeof window !== "undefined") {
      console.log("[ar-test] Secure context:", window.isSecureContext);
    }
    flushSync(() => {
      setStatusLine("Starting AR...");
    });
    setTimeout(() => {
      startHunt();
    }, 0);
  }, [startHunt]);

  const restart = useCallback(() => {
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    setRawCameraMode(false);
    teardownAr();
    clearWatch();
    clearCameraTimeout();
    setPhase("intro");
    setDistanceMeters(null);
    distanceRef.current = Infinity;
    setLocationErrorDetail(null);
    setCameraErrorDetail(null);
    setStatusLine("Ready. Tap Start AR Hunt when you’re set.");
    setArRenderingMode("gps");
    setArDebug(initialArDebug);
    setGeoSnapshot(null);
  }, [clearCameraTimeout, clearWatch, teardownAr]);

  useEffect(() => {
    return () => {
      clearWatch();
      clearCameraTimeout();
      destroyScene();
    };
  }, [clearCameraTimeout, clearWatch, destroyScene]);

  useEffect(() => {
    if (phase !== "ar" || rawCameraMode) {
      document.documentElement.style.removeProperty("background");
      document.body.style.removeProperty("background");
      return;
    }
    document.documentElement.style.setProperty("background", "transparent");
    document.body.style.setProperty("background", "transparent");
    return () => {
      document.documentElement.style.removeProperty("background");
      document.body.style.removeProperty("background");
    };
  }, [phase, rawCameraMode]);

  useEffect(() => {
    if (phase !== "ar" || rawCameraMode) return;
    const tick = () => {
      const list = document.querySelectorAll<HTMLVideoElement>(
        "video:not(#ar-raw-camera-video)",
      );
      const v = list[0];
      setVideoProbe({
        count: list.length,
        ready: v ? String(v.readyState) : "—",
        dim:
          v && v.videoWidth > 0
            ? `${v.videoWidth}x${v.videoHeight}`
            : "—",
      });
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [phase, rawCameraMode]);

  useEffect(() => {
    if (!rawCameraMode || !rawVideoRef.current || !rawStreamRef.current) {
      return;
    }
    const v = rawVideoRef.current;
    v.srcObject = rawStreamRef.current;
    void v.play().catch(() => {});
  }, [rawCameraMode]);

  const showRawCameraTest = useCallback(async () => {
    console.log("[ar-test] Raw camera test — HTML video (outside A-Frame)");
    lastArModeRef.current = arRenderingMode;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      rawStreamRef.current = stream;
      destroyScene();
      setRawCameraMode(true);
    } catch (e) {
      console.error("[ar-test] Raw camera getUserMedia failed", e);
      setCameraErrorDetail(
        e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      );
    }
  }, [arRenderingMode, destroyScene]);

  const dismissRawCameraTest = useCallback(async () => {
    console.log("[ar-test] Dismiss raw camera — restore A-Frame scene");
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    setRawCameraMode(false);
    setPhase("ar_prep");
    patchArDebug({ camera: "loading" });
    try {
      await ensureArScripts();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      patchArDebug({ camera: "ready" });
      mountScene(lastArModeRef.current);
    } catch (e) {
      const detail =
        e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error("[ar-test] Restore AR after raw test failed", detail);
      patchArDebug({ camera: "error" });
      setCameraErrorDetail(detail);
      setPhase("error_cam");
    }
  }, [ensureArScripts, mountScene, patchArDebug]);

  const showArHud = phase === "ar" || phase === "ar_prep";

  return (
    <div
      className={`fixed inset-0 z-0 flex min-h-full w-full flex-col text-zinc-100 ${
        phase === "ar" && !rawCameraMode ? "bg-transparent" : "bg-black"
      }`}
    >
      {phase === "intro" && (
        <div className="relative z-20 flex min-h-full flex-col justify-between px-6 py-10">
          <div className="mx-auto max-w-md pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              AR Hunt · MVP
            </p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-white">
              Location-based AR test
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400">
              This demo uses your{" "}
              <span className="text-zinc-200">camera</span> and{" "}
              <span className="text-zinc-200">precise location</span> to place a
              marker in the real world. Grant permissions when prompted so the
              AR view can load.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md pb-6">
            <button
              type="button"
              onClick={handleStartClick}
              className="w-full rounded-2xl bg-white py-5 text-lg font-semibold text-black shadow-lg transition hover:bg-zinc-100 active:scale-[0.99]"
            >
              Start AR Hunt
            </button>
            <p
              className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-center text-sm leading-snug text-zinc-300"
              role="status"
              aria-live="polite"
            >
              {statusLine}
            </p>
            {isSecureContext === false && (
              <div
                className="mt-4 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm leading-snug text-amber-100"
                role="alert"
              >
                {INSECURE_CONTEXT_WARNING}
              </div>
            )}
            <p className="mt-4 text-center text-sm text-zinc-500">
              Works best on a phone over HTTPS (or localhost).
            </p>
          </div>
        </div>
      )}

      {phase === "locating" && (
        <div className="relative z-20 flex min-h-full flex-col items-center justify-center px-6">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
          <p className="mt-8 text-center text-lg text-zinc-300">
            Getting your location…
          </p>
          <p className="mt-2 max-w-sm text-center text-sm text-zinc-500">
            Allow location access when your browser asks.
          </p>
          <p
            className="mt-8 max-w-md rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-center text-xs leading-relaxed text-zinc-400"
            role="status"
            aria-live="polite"
          >
            {statusLine}
          </p>
        </div>
      )}

      {phase === "too_far" && distanceMeters !== null && (
        <div className="relative z-20 flex min-h-full flex-col justify-between px-6 py-10">
          <div className="mx-auto max-w-md pt-8">
            <h2 className="text-2xl font-semibold text-white">
              Move closer to unlock the AR marker.
            </h2>
            <p className="mt-6 text-5xl font-semibold tabular-nums text-white">
              {distanceMeters}
              <span className="ml-2 text-2xl font-medium text-zinc-500">m</span>
            </p>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">
              Distance is measured to the hunt target. Come within{" "}
              {UNLOCK_RADIUS_METERS} meters to open the camera AR view.
            </p>
            <p
              className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs leading-relaxed text-zinc-400"
              role="status"
            >
              {statusLine}
            </p>
          </div>
          <div className="mx-auto w-full max-w-md pb-6">
            <button
              type="button"
              onClick={restart}
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 py-5 text-lg font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.99]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "ar_prep" && (
        <div className="relative z-20 flex min-h-full flex-col items-center justify-center px-6">
          {!arPrepShowDetail && (
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
          )}
          <p className="mt-8 text-center text-lg text-zinc-300">
            {arPrepShowDetail ? "Still working…" : "Loading AR…"}
          </p>
          <p className="mt-2 max-w-sm text-center text-sm text-zinc-500">
            {arPrepShowDetail
              ? "If this stays blank, check the debug panel after the camera opens — or use “Test model in front of me”."
              : "Allow camera access. Point your phone toward the marker direction."}
          </p>
          <p
            className="mt-8 max-w-md rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-center text-xs leading-relaxed text-zinc-400"
            role="status"
            aria-live="polite"
          >
            {statusLine}
          </p>
          {arPrepShowDetail && (
            <p className="mt-4 max-w-md text-center text-xs text-zinc-500">
              Status detail (after {AR_PREP_SPINNER_REPLACE_MS / 1000}s): scripts
              and scene may still be initializing on iOS Safari.
            </p>
          )}
        </div>
      )}

      {phase === "error_loc" && (
        <div className="relative z-20 flex min-h-full flex-col justify-between px-6 py-10">
          <div className="mx-auto max-w-md pt-8">
            <h2 className="text-2xl font-semibold text-white">
              Location permission needed
            </h2>
            <p className="mt-4 leading-relaxed text-zinc-400">
              We couldn&apos;t read your position. Enable location for this site
              in your browser settings, then try again.
            </p>
            {locationErrorDetail && (
              <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-300">
                {locationErrorDetail}
              </pre>
            )}
          </div>
          <div className="mx-auto w-full max-w-md pb-6">
            <button
              type="button"
              onClick={restart}
              className="w-full rounded-2xl bg-white py-5 text-lg font-semibold text-black transition hover:bg-zinc-100"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {phase === "error_cam" && (
        <div className="relative z-20 flex min-h-full flex-col justify-between px-6 py-10">
          <div className="mx-auto max-w-md pt-8">
            <h2 className="text-2xl font-semibold text-white">
              Camera couldn&apos;t start
            </h2>
            <p className="mt-4 leading-relaxed text-zinc-400">
              Allow camera access for this page, use HTTPS (or localhost), and
              try again. On iOS, Safari usually works best for WebXR-style AR.
            </p>
            {cameraErrorDetail && (
              <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-300">
                {cameraErrorDetail}
              </pre>
            )}
          </div>
          <div className="mx-auto w-full max-w-md pb-6">
            <button
              type="button"
              onClick={restart}
              className="w-full rounded-2xl bg-white py-5 text-lg font-semibold text-black transition hover:bg-zinc-100"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {phase === "ar_stalled" && (
        <div className="relative z-20 flex min-h-full flex-col justify-between px-6 py-10">
          <div className="mx-auto max-w-md pt-8">
            <h2 className="text-2xl font-semibold text-white">
              Camera preview is slow or blocked
            </h2>
            <p className="mt-4 leading-relaxed text-zinc-400">
              The AR scene didn&apos;t finish loading in time. Close other tabs
              using the camera, check permissions, and try again on a stable
              connection.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md pb-6">
            <button
              type="button"
              onClick={restart}
              className="w-full rounded-2xl bg-white py-5 text-lg font-semibold text-black transition hover:bg-zinc-100"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {phase === "success" && (
        <div className="relative z-50 flex min-h-full flex-col items-center justify-center bg-black px-6">
          <p className="text-center text-3xl font-semibold leading-snug text-white">
            You found the AR marker!
          </p>
          <button
            type="button"
            onClick={restart}
            className="mt-12 w-full max-w-md rounded-2xl bg-white py-5 text-lg font-semibold text-black transition hover:bg-zinc-100"
          >
            Restart
          </button>
        </div>
      )}

      <video
        id="ar-raw-camera-video"
        ref={rawVideoRef}
        className={`fixed inset-0 z-[5] h-[100dvh] w-full object-cover ${
          rawCameraMode ? "block" : "hidden"
        }`}
        playsInline
        muted
        autoPlay
        aria-hidden={!rawCameraMode}
      />

      <div
        ref={sceneHostRef}
        className={`fixed inset-0 z-10 h-full w-full ${
          showArHud && !rawCameraMode ? "block" : "pointer-events-none invisible"
        } ${phase === "ar" && !rawCameraMode ? "bg-transparent" : ""}`}
        aria-hidden={!showArHud || rawCameraMode}
      />

      {showArHud && (
        <div className="pointer-events-auto fixed left-2 right-2 top-2 z-40 max-h-[50vh] overflow-y-auto rounded-lg border border-zinc-700 bg-black/85 p-3 text-[11px] leading-snug text-zinc-200 shadow-xl backdrop-blur-sm sm:left-auto sm:right-3 sm:max-w-sm">
          <p className="font-semibold text-white">AR debug</p>
          <ul className="mt-2 space-y-1 font-mono text-[10px] text-zinc-300">
            <li>
              Camera:{" "}
              <span
                className={
                  arDebug.camera === "ready"
                    ? "text-emerald-400"
                    : arDebug.camera === "error"
                      ? "text-red-400"
                      : "text-amber-300"
                }
              >
                {arDebug.camera}
              </span>
            </li>
            <li>
              Location:{" "}
              {geoSnapshot
                ? `${geoSnapshot.lat.toFixed(6)}, ${geoSnapshot.lon.toFixed(6)}`
                : "—"}
            </li>
            <li>
              Distance:{" "}
              {geoSnapshot ? `${geoSnapshot.dist} m` : "—"}
            </li>
            <li>
              AR scripts:{" "}
              <span
                className={
                  arDebug.arScripts === "loaded"
                    ? "text-emerald-400"
                    : arDebug.arScripts === "error"
                      ? "text-red-400"
                      : "text-amber-300"
                }
              >
                {arDebug.arScripts}
              </span>
            </li>
            <li>
              Model:{" "}
              <span
                className={
                  arDebug.model === "loaded"
                    ? "text-emerald-400"
                    : arDebug.model === "error"
                      ? "text-red-400"
                      : "text-amber-300"
                }
              >
                {arDebug.model}
              </span>{" "}
              <span className="text-zinc-500">({CHARACTER_MODEL_SRC})</span>
            </li>
            <li>
              GPS anchor:{" "}
              <span
                className={
                  arDebug.gpsAnchor === "active"
                    ? "text-emerald-400"
                    : "text-zinc-500"
                }
              >
                {arDebug.gpsAnchor === "active" ? "active" : "off"}
              </span>
            </li>
            <li className="text-amber-200">
              Mode: {arDebug.modeLabel}
            </li>
            <li>
              Model URL:{" "}
              <span
                className={
                  arDebug.modelUrlStatus === "loaded"
                    ? "text-emerald-400"
                    : arDebug.modelUrlStatus === "failed"
                      ? "text-red-400"
                      : "text-amber-300"
                }
              >
                {arDebug.modelUrlStatus}
              </span>
            </li>
            <li>Model bounds: {arDebug.modelBoundsInfo ?? "—"}</li>
            {arDebug.modelLoadErrorDetail && (
              <li className="break-all text-red-300">
                GLB error: {arDebug.modelLoadErrorDetail}
              </li>
            )}
            <li>
              Video elements: {videoProbe.count}
            </li>
            <li>Video readyState: {videoProbe.ready}</li>
            <li>Video dimensions: {videoProbe.dim}</li>
            {rawCameraMode && (
              <li className="text-cyan-300">Raw HTML video test active</li>
            )}
          </ul>
          {arDebug.modelVisibleError && (
            <p className="mt-2 rounded border border-red-900/60 bg-red-950/50 px-2 py-1.5 text-red-200">
              {arDebug.modelVisibleError}
            </p>
          )}
        </div>
      )}

      {showArHud && (
        <div
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[100] border-t border-zinc-800 bg-black/90 px-4 pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md"
          style={{
            paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
          }}
        >
          <p className="mb-3 text-center text-[11px] leading-snug text-zinc-400">
            {rawCameraMode
              ? "Plain getUserMedia video (no AR.js). Use “Return to AR scene” when done."
              : arRenderingMode === "diagnostic"
                ? "Diagnostic: huge GLB, cyan sphere, red box — strong lights. Tap any to collect."
                : arRenderingMode === "test"
                  ? "Test mode: GLB or sphere fixed in front of the camera. Tap to collect."
                  : "GPS mode: use the buttons below to verify rendering without GPS placement."}
          </p>
          <div className="flex flex-col gap-2">
            {rawCameraMode ? (
              <button
                type="button"
                onClick={() => void dismissRawCameraTest()}
                className="w-full rounded-xl bg-white py-3.5 text-sm font-semibold text-black active:opacity-90"
              >
                Return to AR scene
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void showBigDiagnosticModel()}
                  className="w-full rounded-xl bg-violet-600 py-3.5 text-sm font-semibold text-white active:opacity-90"
                >
                  Show big test model
                </button>
                <button
                  type="button"
                  onClick={() => void switchToTestMode()}
                  className="w-full rounded-xl bg-white py-3.5 text-sm font-semibold text-black active:opacity-90"
                >
                  Test model in front of me
                </button>
                <button
                  type="button"
                  onClick={showFallbackSphereOnly}
                  disabled={
                    !(
                      phase === "ar" &&
                      (arRenderingMode === "test" ||
                        arRenderingMode === "diagnostic")
                    )
                  }
                  title={
                    arRenderingMode === "test" ||
                    arRenderingMode === "diagnostic"
                      ? "Hide GLB and show the bright sphere"
                      : "Switch to test or diagnostic first"
                  }
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-900 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Show fallback sphere
                </button>
                <button
                  type="button"
                  onClick={() => void showRawCameraTest()}
                  className="w-full rounded-xl border border-cyan-700 bg-cyan-950 py-3.5 text-sm font-semibold text-cyan-100"
                >
                  Show raw camera test
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
