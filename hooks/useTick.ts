"use client";

import { useEffect, useState } from "react";

// Re-renders the caller every `ms` while the page is visible. Used for countdowns.
export function useTick(ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setN((n) => n + 1);
    }, ms);
    return () => window.clearInterval(id);
  }, [ms]);
}
