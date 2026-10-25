"use client";

import { useEffect } from "react";
import { startInstallWatch } from "@/lib/install";

// Starts watching for the install prompt as early as possible, and registers the service
// worker in production builds. In dev the worker would cache stale code, so it's skipped.
export default function PwaBoot() {
  useEffect(() => {
    startInstallWatch();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Ask the browser not to evict our storage (the player token lives there).
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  return null;
}
