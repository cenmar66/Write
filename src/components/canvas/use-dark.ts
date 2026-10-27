"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useCanvas } from "./provider";

/** Subscribe to a CSS media query. */
export function useMedia(query: string, serverValue = false) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Whether the planner is currently drawn in dark mode (pref, or system when "system"). */
export function useIsDark() {
  const { prefs } = useCanvas();
  const systemDark = useMedia("(prefers-color-scheme: dark)");
  return prefs.theme === "dark" || (prefs.theme === "system" && systemDark);
}
