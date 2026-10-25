"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Fix } from "@/lib/types";

export type GpsStatus = "idle" | "asking" | "ok" | "denied" | "unavailable";

/*
  Watches the device position while `enabled` is true.

  Mobile browsers like to quietly kill a watch when the page was hidden, so we
  restart it every time the page becomes visible again. Cheap, and it fixes the
  "GPS froze after I checked a text" class of bugs.
*/
export function useGeolocation(enabled: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<GpsStatus>("idle");
  const watchId = useRef<number | null>(null);
  const beatId = useRef<number | null>(null);
  const brokenSinceFix = useRef(false);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    if (beatId.current !== null) window.clearInterval(beatId.current);
    watchId.current = null;
    beatId.current = null;
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    stop();
    setStatus((s) => (s === "ok" ? s : "asking"));
    const onPos = (pos: GeolocationPosition) => {
      brokenSinceFix.current = false;
      setStatus("ok");
      setFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
        // Stamp with arrival time, not pos.timestamp. Some browsers hand back an old or cached
        // device timestamp for a perfectly current reading, and we'd then discard it as stale.
        ts: Date.now(),
      });
    };
    const onErr = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setStatus("denied");
      else brokenSinceFix.current = true;
    };
    // No timeout on purpose: for a watch, a timeout just means "nothing changed", and that
    // is exactly what standing still looks like. Only a real error (position unavailable)
    // should count as a lost GPS.
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 2000 });
    // Phones stop calling watchPosition while you stand still, and a hider sitting behind a
    // tree is the normal case in this game. As long as the GPS hasn't reported a problem,
    // the last position is still the right one, so keep its timestamp fresh.
    beatId.current = window.setInterval(() => {
      if (!brokenSinceFix.current) setFix((f) => (f ? { ...f, ts: Date.now() } : f));
    }, 3000);
  }, [stop]);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    start();
    const onVisible = () => {
      if (document.visibilityState === "visible") start();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [enabled, start, stop]);

  return { fix, status, retry: start };
}
