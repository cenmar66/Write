"use client";

import { useEffect } from "react";

/** Registers the offline service worker for /satori (production builds only). */
export function RegisterSatoriServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/satori-sw.js", { scope: "/satori" }).catch(() => {});
  }, []);
  return null;
}
