"use client";

import { useEffect } from "react";

/** Registers the offline service worker for /dojo (production builds only). */
export function RegisterDojoServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/dojo-sw.js", { scope: "/dojo" }).catch(() => {});
  }, []);
  return null;
}
