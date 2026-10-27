"use client";

import { useEffect } from "react";

/** Registers the offline service worker for /canvas (production builds only). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_CANVAS_SW_DEV !== "1") return;
    navigator.serviceWorker.register("/canvas-sw.js", { scope: "/canvas" }).catch((e) => console.warn("[canvas] service worker", e));
  }, []);
  return null;
}
