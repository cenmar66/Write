"use client";

import { useEffect, useState } from "react";
import { useCanvas } from "./provider";

/** Whether the planner is currently drawn in dark mode (pref, or system when "system"). */
export function useIsDark() {
  const { prefs } = useCanvas();
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return prefs.theme === "dark" || (prefs.theme === "system" && systemDark);
}

export function useMedia(query: string, initial = false) {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setM(mq.matches);
    const on = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}
