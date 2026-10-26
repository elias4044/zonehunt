"use client";

import { useCallback, useEffect, useState } from "react";

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type IOSPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

export function useHeading(active: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState(false);
  const iosApi = typeof DeviceOrientationEvent !== "undefined"
    ? (DeviceOrientationEvent as unknown as IOSPermissionApi)
    : undefined;
  const needsTap = !!iosApi?.requestPermission && !granted;

  const enable = useCallback(async () => {
    if (iosApi?.requestPermission) {
      try {
        const res = await iosApi.requestPermission();
        setGranted(res === "granted");
      } catch {
        setGranted(false);
      }
    } else {
      setGranted(true);
    }
  }, [iosApi]);

  useEffect(() => {
    if (!active) return;
    if (!iosApi?.requestPermission) setGranted(true);
  }, [active, iosApi]);

  useEffect(() => {
    if (!active || !granted) return;
    const handler = (ev: Event) => {
      const e = ev as IOSOrientationEvent;
      if (typeof e.webkitCompassHeading === "number") {
        setHeading(e.webkitCompassHeading);
      } else if (e.alpha !== null && e.absolute !== false) {
        setHeading((360 - e.alpha) % 360);
      }
    };
    // 'deviceorientationabsolute' is the one that points at magnetic north on Android.
    window.addEventListener("deviceorientationabsolute", handler as EventListener);
    window.addEventListener("deviceorientation", handler as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as EventListener);
      window.removeEventListener("deviceorientation", handler as EventListener);
    };
  }, [active, granted]);

  return { heading, needsTap, enable };
}
