"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const AFRAME_URL = "https://aframe.io/releases/1.4.2/aframe.min.js";
const ASTRONAUT_GLB =
  "https://modelviewer.dev/shared-assets/models/Astronaut.glb";

const UI_Z = 1000;
const SCENE_Z = 10;
const VIDEO_Z = 0;

type CamState = "idle" | "requesting" | "ready" | "error";
type LibState = "idle" | "loading" | "loaded" | "error";
type ModelState = "idle" | "loading" | "loaded" | "error";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
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
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}

function styleSceneCanvas(sceneEl: HTMLElement) {
  sceneEl.style.setProperty("position", "fixed");
  sceneEl.style.setProperty("inset", "0");
  sceneEl.style.setProperty("width", "100vw");
  sceneEl.style.setProperty("height", "100vh");
  sceneEl.style.setProperty("z-index", String(SCENE_Z));
  sceneEl.style.setProperty("background", "transparent");
  sceneEl.querySelectorAll("canvas").forEach((node) => {
    const c = node as HTMLCanvasElement;
    c.style.setProperty("position", "fixed");
    c.style.setProperty("inset", "0");
    c.style.setProperty("width", "100vw");
    c.style.setProperty("height", "100vh");
    c.style.setProperty("z-index", String(SCENE_Z));
    c.style.setProperty("pointer-events", "auto");
    c.style.setProperty("background", "transparent");
  });
}

export default function ArDiagnosticPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sceneHostRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraStatus, setCameraStatus] = useState<CamState>("idle");
  const [aframeStatus, setAframeStatus] = useState<LibState>("idle");
  const [modelStatus, setModelStatus] = useState<ModelState>("idle");
  const [modelErrorDetail, setModelErrorDetail] = useState<string | null>(null);

  const teardown = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (sceneHostRef.current) {
      sceneHostRef.current.innerHTML = "";
    }
    setModelStatus("idle");
    setAframeStatus("idle");
    setModelErrorDetail(null);
  }, []);

  const bootstrap = useCallback(async () => {
    setCameraStatus("requesting");
    setAframeStatus("loading");
    setModelStatus("loading");
    setModelErrorDetail(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setCameraStatus("ready");
    } catch (e) {
      setCameraStatus("error");
      setAframeStatus("idle");
      setModelStatus("idle");
      setModelErrorDetail(
        e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      );
      return;
    }

    try {
      await loadScript(AFRAME_URL);
      setAframeStatus("loaded");
    } catch (e) {
      setAframeStatus("error");
      setModelStatus("idle");
      setModelErrorDetail(
        e instanceof Error ? e.message : "A-Frame script failed",
      );
      return;
    }

    const host = sceneHostRef.current;
    if (!host) return;

    host.innerHTML = "";

    const scene = document.createElement("a-scene");
    scene.setAttribute("embedded", "");
    scene.setAttribute("vr-mode-ui", "enabled: false");
    scene.setAttribute("loading-screen", "enabled: false");
    scene.setAttribute(
      "renderer",
      "logarithmicDepthBuffer: true; antialias: true",
    );

    const assets = document.createElement("a-assets");
    const assetItem = document.createElement("a-asset-item");
    assetItem.setAttribute("id", "astronautModel");
    assetItem.setAttribute("src", ASTRONAUT_GLB);
    assetItem.setAttribute("crossorigin", "anonymous");
    assets.appendChild(assetItem);

    const ambient = document.createElement("a-entity");
    ambient.setAttribute(
      "light",
      "type: ambient; color: #ffffff; intensity: 2",
    );
    const directional = document.createElement("a-entity");
    directional.setAttribute(
      "light",
      "type: directional; color: #ffffff; intensity: 2",
    );
    directional.setAttribute("position", "0 6 4");

    const camera = document.createElement("a-camera");
    camera.setAttribute("position", "0 1.6 0");
    camera.setAttribute("look-controls", "pointerLockEnabled: false");

    const astro = document.createElement("a-entity");
    astro.setAttribute("gltf-model", "#astronautModel");
    astro.setAttribute("position", "0 -1 -3");
    astro.setAttribute("rotation", "0 0 0");

    const box = document.createElement("a-box");
    box.setAttribute("position", "-1 0 -3");
    box.setAttribute("color", "#ff3333");
    box.setAttribute("width", "0.6");
    box.setAttribute("height", "0.6");
    box.setAttribute("depth", "0.6");

    const sphere = document.createElement("a-sphere");
    sphere.setAttribute("position", "1 0 -3");
    sphere.setAttribute("radius", "0.45");
    sphere.setAttribute("color", "#22ffc8");
    sphere.setAttribute(
      "material",
      "shader: flat; color: #22ffc8; emissive: #004433; emissiveIntensity: 0.3",
    );

    camera.appendChild(astro);
    camera.appendChild(box);
    camera.appendChild(sphere);

    scene.appendChild(assets);
    scene.appendChild(ambient);
    scene.appendChild(directional);
    scene.appendChild(camera);

    astro.addEventListener(
      "model-loaded",
      () => {
        setModelStatus("loaded");
        setModelErrorDetail(null);
      },
      { once: true },
    );
    astro.addEventListener(
      "model-error",
      (ev) => {
        setModelStatus("error");
        const d =
          "detail" in ev && (ev as CustomEvent).detail != null
            ? JSON.stringify((ev as CustomEvent).detail)
            : String(ev);
        setModelErrorDetail(d);
      },
      { once: true },
    );

    host.appendChild(scene);

    const sceneEl = scene as unknown as HTMLElement;
    styleSceneCanvas(sceneEl);
    window.requestAnimationFrame(() => styleSceneCanvas(sceneEl));
    scene.addEventListener("loaded", () => styleSceneCanvas(sceneEl));
  }, []);

  const restart = useCallback(() => {
    teardown();
    setCameraStatus("idle");
    void bootstrap();
  }, [bootstrap, teardown]);

  useEffect(() => {
    void bootstrap();
    return () => teardown();
  }, [bootstrap, teardown]);

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        className="fixed inset-0 h-full w-full object-cover"
        style={{ zIndex: VIDEO_Z }}
        autoPlay
        playsInline
        muted
        aria-hidden
      />

      <div
        ref={sceneHostRef}
        className="fixed inset-0"
        style={{ zIndex: SCENE_Z, pointerEvents: "auto" }}
        aria-hidden
      />

      <div
        className="pointer-events-auto fixed left-3 top-3 max-w-[min(100%-24px,320px)] rounded-lg border border-zinc-600 bg-black/90 p-3 font-mono text-[11px] text-zinc-200 shadow-xl"
        style={{ zIndex: UI_Z }}
      >
        <p className="mb-2 font-sans text-sm font-semibold text-white">
          A-Frame · camera overlay (no AR.js)
        </p>
        <ul className="space-y-1">
          <li>
            Camera:{" "}
            <span
              className={
                cameraStatus === "ready"
                  ? "text-emerald-400"
                  : cameraStatus === "error"
                    ? "text-red-400"
                    : "text-amber-300"
              }
            >
              {cameraStatus}
            </span>
          </li>
          <li>
            A-Frame:{" "}
            <span
              className={
                aframeStatus === "loaded"
                  ? "text-emerald-400"
                  : aframeStatus === "error"
                    ? "text-red-400"
                    : "text-amber-300"
              }
            >
              {aframeStatus}
            </span>
          </li>
          <li>
            Model:{" "}
            <span
              className={
                modelStatus === "loaded"
                  ? "text-emerald-400"
                  : modelStatus === "error"
                    ? "text-red-400"
                    : "text-amber-300"
              }
            >
              {modelStatus}
            </span>
          </li>
        </ul>
        <p className="mt-2 break-all text-[10px] text-zinc-500">
          {ASTRONAUT_GLB}
        </p>
        {modelErrorDetail && (
          <p className="mt-2 break-all text-[10px] text-red-300">
            {modelErrorDetail}
          </p>
        )}
        <button
          type="button"
          onClick={restart}
          className="mt-3 w-full rounded-lg bg-white py-2 text-sm font-semibold text-black"
        >
          Restart
        </button>
      </div>
    </div>
  );
}
