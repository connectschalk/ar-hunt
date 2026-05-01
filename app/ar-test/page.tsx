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
// GLB marker (`public/character.glb` → URL `/character.glb`)
// Matches: <a-assets><a-asset-item id="characterModel" src="/character.glb"></a-asset-item></a-assets>
// -----------------------------------------------------------------------------
const CHARACTER_MODEL_SRC = "/character.glb";
const CHARACTER_MODEL_ASSET_ID = "characterModel";

/** Uniform scale of the AR model (X Y Z) — tweak size in the scene */
const CHARACTER_MODEL_SCALE = "0.5 0.5 0.5";
/** Rotation in degrees (X Y Z) — tweak facing */
const CHARACTER_MODEL_ROTATION = "0 180 0";
/**
 * Model position at the GPS point (meters, local X Y Z).
 * Adjust the middle value (Y) for height above the anchor / ground.
 */
const CHARACTER_MODEL_POSITION = "0 0 0";

/** Label above the marker (local offset at the same GPS point) — raise Y to sit above a tall model */
const COLLECT_LABEL_POSITION = "0 2 0";
const COLLECT_LABEL_SCALE = "5 5 5";
const COLLECT_LABEL_COLOR = "#FFFFFF";

/**
 * AR.js script URL (AR.js org build 3.3.2).
 * Note: `https://unpkg.com/aframe-arjs@3.3.2/aframe-ar.js` is not published on npm/CDN;
 * jsdelivr serves the same release tag from GitHub.
 */
const AR_JS_URL =
  "https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.3.2/aframe/build/aframe-ar.js";
const AFRAME_URL = "https://aframe.io/releases/1.4.2/aframe.min.js";

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

export default function ArTestPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  /** Shown below Start (intro) and on hunt progress screens for debugging */
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

  const sceneHostRef = useRef<HTMLDivElement | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const scriptsPromiseRef = useRef<Promise<void> | null>(null);
  const distanceRef = useRef<number>(Infinity);
  const phaseRef = useRef<Phase>("intro");
  const enteringArRef = useRef(false);
  const cameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  phaseRef.current = phase;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const secure = window.isSecureContext;
    console.log("[ar-test] Secure context:", secure);
    setIsSecureContext(secure);
  }, []);

  const clearCameraTimeout = useCallback(() => {
    if (cameraTimeoutRef.current !== null) {
      clearTimeout(cameraTimeoutRef.current);
      cameraTimeoutRef.current = null;
    }
  }, []);

  const destroyScene = useCallback(() => {
    clearCameraTimeout();
    const host = sceneHostRef.current;
    if (host) {
      host.innerHTML = "";
    }
  }, [clearCameraTimeout]);

  const ensureArScripts = useCallback(async () => {
    console.log("[ar-test] Loading AR scripts");
    setStatusLine("Loading AR scripts…");
    if (!scriptsPromiseRef.current) {
      scriptsPromiseRef.current = (async () => {
        await loadScript(AFRAME_URL);
        await loadScript(AR_JS_URL);
      })();
    }
    await scriptsPromiseRef.current;
    console.log("[ar-test] AR scripts finished loading");
  }, []);

  const handleCollected = useCallback(() => {
    destroyScene();
    setPhase("success");
  }, [destroyScene]);

  const collectHandlerRef = useRef(handleCollected);
  collectHandlerRef.current = handleCollected;

  const mountScene = useCallback(() => {
    const host = sceneHostRef.current;
    if (!host) return;

    host.innerHTML = "";

    const scene = document.createElement("a-scene");
    scene.setAttribute(
      "embedded",
      "",
    );
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
    cursor.setAttribute("geometry", "primitive: ring; radiusInner: 0.02; radiusOuter: 0.03");
    cursor.setAttribute("material", "color: #ffffff; shader: flat");
    cursor.setAttribute("raycaster", "objects: .clickable");
    camera.appendChild(cursor);

    const gpsPlace = `latitude: ${TARGET_LATITUDE}; longitude: ${TARGET_LONGITUDE}`;

    const modelEntity = document.createElement("a-entity");
    modelEntity.id = "ar-object";
    modelEntity.setAttribute("gltf-model", `#${CHARACTER_MODEL_ASSET_ID}`);
    modelEntity.setAttribute("gps-entity-place", gpsPlace);
    modelEntity.setAttribute("scale", CHARACTER_MODEL_SCALE);
    modelEntity.setAttribute("rotation", CHARACTER_MODEL_ROTATION);
    modelEntity.setAttribute("position", CHARACTER_MODEL_POSITION);
    modelEntity.setAttribute("class", "clickable");
    modelEntity.setAttribute("visible", "true");

    const sphere = document.createElement("a-sphere");
    sphere.setAttribute("radius", "2");
    sphere.setAttribute(
      "material",
      "color: #22ffc8; metalness: 0.2; roughness: 0.35; emissive: #004433; emissiveIntensity: 0.35",
    );
    sphere.setAttribute("gps-entity-place", gpsPlace);
    sphere.setAttribute("position", CHARACTER_MODEL_POSITION);
    sphere.setAttribute("class", "clickable");
    sphere.setAttribute("visible", "false");

    const label = document.createElement("a-text");
    label.setAttribute("value", "Tap to collect");
    label.setAttribute("align", "center");
    label.setAttribute("position", COLLECT_LABEL_POSITION);
    label.setAttribute("scale", COLLECT_LABEL_SCALE);
    label.setAttribute("color", COLLECT_LABEL_COLOR);
    label.setAttribute("gps-entity-place", gpsPlace);

    const onCollectClick = (ev: Event) => {
      ev.stopPropagation();
      collectHandlerRef.current();
    };
    modelEntity.addEventListener("click", onCollectClick);
    sphere.addEventListener("click", onCollectClick);

    let modelLoadSettled = false;
    const fallbackMs = 15000;
    let fallbackTimer: number;

    const activateSphereFallback = (reason: string) => {
      window.clearTimeout(fallbackTimer);
      if (modelLoadSettled) return;
      modelLoadSettled = true;
      console.error("[ar-test] GLB unavailable; showing sphere fallback:", reason);
      modelEntity.setAttribute("visible", "false");
      sphere.setAttribute("visible", "true");
    };

    fallbackTimer = window.setTimeout(() => {
      if (!modelLoadSettled) {
        activateSphereFallback(`no model-loaded within ${fallbackMs}ms`);
      }
    }, fallbackMs) as unknown as number;

    modelEntity.addEventListener(
      "model-loaded",
      () => {
        window.clearTimeout(fallbackTimer);
        modelLoadSettled = true;
        sphere.setAttribute("visible", "false");
        console.log(
          "[ar-test] GLB model loaded successfully:",
          CHARACTER_MODEL_SRC,
        );
      },
      { once: true },
    );
    modelEntity.addEventListener(
      "model-error",
      (ev) => {
        console.error(
          "[ar-test] GLB model failed to load:",
          CHARACTER_MODEL_SRC,
          ev,
        );
        activateSphereFallback("model-error");
      },
      { once: true },
    );

    scene.appendChild(assets);
    scene.appendChild(camera);
    scene.appendChild(modelEntity);
    scene.appendChild(sphere);
    scene.appendChild(label);

    let settled = false;
    const markReady = () => {
      if (settled) return;
      if (phaseRef.current !== "ar_prep") return;
      settled = true;
      clearCameraTimeout();
      setPhase("ar");
    };

    scene.addEventListener("loaded", markReady);

    cameraTimeoutRef.current = setTimeout(() => {
      if (!settled && phaseRef.current === "ar_prep") {
        settled = true;
        destroyScene();
        setPhase("ar_stalled");
      }
    }, 18000);

    host.appendChild(scene);
  }, [clearCameraTimeout, destroyScene]);

  const teardownAr = useCallback(() => {
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
    setPhase("ar_prep");

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
        setStatusLine("Camera allowed. Starting AR scene…");
        stream.getTracks().forEach((t) => t.stop());
      } catch (camErr) {
        const detail =
          camErr instanceof Error
            ? `${camErr.name}: ${camErr.message}`
            : String(camErr);
        console.log("[ar-test] Camera error", detail);
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

      mountScene();
    } catch (outer) {
      const detail =
        outer instanceof Error
          ? `${outer.name}: ${outer.message}`
          : String(outer);
      console.log("[ar-test] Camera error (outer)", detail);
      setCameraErrorDetail(detail);
      setPhase("error_cam");
    } finally {
      enteringArRef.current = false;
    }
  }, [ensureArScripts, mountScene, teardownAr]);

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
    teardownAr();
    clearWatch();
    clearCameraTimeout();
    setPhase("intro");
    setDistanceMeters(null);
    distanceRef.current = Infinity;
    setLocationErrorDetail(null);
    setCameraErrorDetail(null);
    setStatusLine("Ready. Tap Start AR Hunt when you’re set.");
  }, [clearCameraTimeout, clearWatch, teardownAr]);

  useEffect(() => {
    return () => {
      clearWatch();
      clearCameraTimeout();
      destroyScene();
    };
  }, [clearCameraTimeout, clearWatch, destroyScene]);

  return (
    <div className="fixed inset-0 z-0 flex flex-col bg-black text-zinc-100">
      {/* Intro */}
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

      {/* Locating */}
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

      {/* Too far */}
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

      {/* AR prep */}
      {phase === "ar_prep" && (
        <div className="relative z-20 flex min-h-full flex-col items-center justify-center px-6">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
          <p className="mt-8 text-center text-lg text-zinc-300">
            Loading AR…
          </p>
          <p className="mt-2 max-w-sm text-center text-sm text-zinc-500">
            Allow camera access. Point your phone toward the marker direction.
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

      {/* Location denied / unavailable */}
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

      {/* Camera error */}
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

      {/* Camera / scene stalled */}
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

      {/* Success */}
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

      {/* Full-screen AR host; visible only when AR runs */}
      <div
        ref={sceneHostRef}
        className={`fixed inset-0 z-10 h-full w-full ${phase === "ar" || phase === "ar_prep" ? "block" : "pointer-events-none invisible"}`}
        aria-hidden={phase !== "ar" && phase !== "ar_prep"}
      />

      {/* Hint while in AR */}
      {phase === "ar" && (
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 to-transparent px-4 pb-8 pt-16">
          <p className="pointer-events-none text-center text-sm text-zinc-300">
            Walk the marker into view, then tap the glowing sphere.
          </p>
        </div>
      )}
    </div>
  );
}
