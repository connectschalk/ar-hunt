"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PermissionState = "unknown" | "granted" | "denied" | "unsupported";

function readHeading(e: DeviceOrientationEvent): number | null {
  const w = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
  if (
    typeof w.webkitCompassHeading === "number" &&
    !Number.isNaN(w.webkitCompassHeading)
  ) {
    return w.webkitCompassHeading;
  }
  if (e.absolute && e.alpha != null && !Number.isNaN(e.alpha)) {
    return (360 - e.alpha + 360) % 360;
  }
  return null;
}

type DeviceOrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function getOrientationCtor(): DeviceOrientationEventConstructor | undefined {
  if (typeof DeviceOrientationEvent === "undefined") return undefined;
  return DeviceOrientationEvent as DeviceOrientationEventConstructor;
}

function iosOrientationPermissionNeeded(): boolean {
  const ctor = getOrientationCtor();
  return typeof ctor?.requestPermission === "function";
}

/**
 * Device compass heading (degrees from north, clockwise), or null until first reading.
 * iOS 13+: call requestCompassPermission() from a click/tap handler.
 */
export function useDeviceHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const listeningRef = useRef(false);

  const attachListener = useCallback(() => {
    if (typeof window === "undefined") return () => {};
    if (listeningRef.current) return () => {};
    const onOrient = (e: DeviceOrientationEvent) => {
      const h = readHeading(e);
      if (h != null) setHeading(h);
    };
    window.addEventListener("deviceorientation", onOrient, true);
    listeningRef.current = true;
    return () => {
      window.removeEventListener("deviceorientation", onOrient, true);
      listeningRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof DeviceOrientationEvent === "undefined") {
      setPermission("unsupported");
      return;
    }
    if (iosOrientationPermissionNeeded()) {
      setPermission("unknown");
    } else {
      setPermission("granted");
    }
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    return attachListener();
  }, [permission, attachListener]);

  const requestCompassPermission = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (typeof DeviceOrientationEvent === "undefined") {
      setPermission("unsupported");
      return;
    }
    if (iosOrientationPermissionNeeded()) {
      try {
        const ctor = getOrientationCtor();
        const res = await ctor?.requestPermission?.();
        if (res === "granted") setPermission("granted");
        else setPermission("denied");
      } catch {
        setPermission("denied");
      }
      return;
    }
    setPermission("granted");
  }, []);

  return {
    headingDeg: heading,
    permission,
    requestCompassPermission,
    headingAvailable: heading != null,
  };
}
