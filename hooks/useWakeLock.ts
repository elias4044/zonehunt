"use client";

import { useEffect, useState } from "react";

export type WakeStatus = "unsupported" | "off" | "on";

/*
  Keeps the screen awake while `enabled`. This is the single most important thing for
  a web-based GPS game: a locked phone means a suspended page means no position updates.
  The browser drops the lock whenever the page is hidden, so we ask again on return.
*/
export function useWakeLock(enabled: boolean) {
  const [status, setStatus] = useState<WakeStatus>("off");

  useEffect(() => {
    if (!enabled) return;
    if (!("wakeLock" in navigator)) {
      setStatus("unsupported");
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const grab = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        setStatus("on");
        lock.addEventListener("release", () => setStatus("off"));
      } catch {
        setStatus("off");
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") grab();
    };

    grab();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [enabled]);

  return status;
}
