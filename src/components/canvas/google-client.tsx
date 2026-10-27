"use client";

import { useEffect, useSyncExternalStore } from "react";
import { addDays } from "@/lib/canvas/dates";
import type { ExternalEvent, ISODate } from "@/lib/canvas/types";
import { useCanvas } from "./provider";

export interface GoogleStatus {
  loaded: boolean;
  configured: boolean; // server has GOOGLE_CLIENT_ID/SECRET
  connected: boolean;
  email: string | null;
  canReadCalendar: boolean;
  canWriteCalendar: boolean;
  canTasks: boolean;
  selectedCalendars: string[];
  tasksListId: string | null;
  tasksSettings: { importEnabled?: boolean; importSection?: string; autoLinkSections?: string[] };
  lastCalendarSync: string | null;
  lastTasksSync: string | null;
  lastError: string | null;
}

const EMPTY: GoogleStatus = {
  loaded: false,
  configured: false,
  connected: false,
  email: null,
  canReadCalendar: false,
  canWriteCalendar: false,
  canTasks: false,
  selectedCalendars: [],
  tasksListId: null,
  tasksSettings: {},
  lastCalendarSync: null,
  lastTasksSync: null,
  lastError: null,
};

let status: GoogleStatus = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

export async function refreshGoogleStatus() {
  inflight ??= (async () => {
    try {
      const r = await fetch("/api/canvas/google/status", { cache: "no-store" });
      if (r.ok) status = { ...EMPTY, ...(await r.json()), loaded: true };
      else status = { ...status, loaded: true };
    } catch {
      status = { ...status, loaded: true };
    } finally {
      inflight = null;
      listeners.forEach((l) => l());
    }
  })();
  return inflight;
}

export function useGoogleStatus(): GoogleStatus {
  const { mode } = useCanvas();
  const s = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
    () => status,
  );
  useEffect(() => {
    if (mode === "cloud" && !status.loaded && navigator.onLine) void refreshGoogleStatus();
  }, [mode]);
  return mode === "cloud" ? s : { ...EMPTY, loaded: true };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`);
  return body as T;
}

export const googleApi = {
  calendars: () => api<{ calendars: { id: string; summary: string; primary?: boolean; backgroundColor?: string; accessRole: string }[] }>("/api/canvas/google/calendars"),
  saveSettings: (body: Record<string, unknown>) => api<{ ok: true }>("/api/canvas/google/settings", { method: "POST", body: JSON.stringify(body) }),
  disconnect: () => api<{ ok: true }>("/api/canvas/google/disconnect", { method: "POST" }),
  events: (from: ISODate, to: ISODate, tz: string) => api<{ events: ExternalEvent[] }>(`/api/canvas/google/events?from=${from}&to=${to}&tz=${encodeURIComponent(tz)}`),
  taskLists: () => api<{ lists: { id: string; title: string }[] }>("/api/canvas/google/tasks/lists"),
  tasksSync: () => api<{ exported: number; imported: number; updatedLocal: number; updatedRemote: number; conflicts: number; errors: string[] }>("/api/canvas/google/tasks/sync", { method: "POST" }),
  audit: () => api<{ entries: { id: string; provider: string; action: string; status: string; detail: Record<string, unknown>; at: string }[] }>("/api/canvas/google/audit"),
};

export async function createGoogleEvent(e: { title: string; date: ISODate; start: string; end: string | null; location: string | null; notes: string; timeZone: string }) {
  return api<{ id: string; htmlLink: string }>("/api/canvas/google/events", { method: "POST", body: JSON.stringify(e) });
}

/**
 * Keeps the device's cache of Google events fresh around the day being viewed.
 * Cached events stay visible offline (marked as from Google; read-only here).
 */
export function CalendarSync() {
  const { date, store, prefs, mode } = useCanvas();
  const g = useGoogleStatus();
  useEffect(() => {
    if (mode !== "cloud" || !g.connected || !g.canReadCalendar) return;
    let stop = false;
    const from = addDays(date, -3);
    const to = addDays(date, 10);
    const load = async () => {
      if (!navigator.onLine) return;
      try {
        const { events } = await googleApi.events(from, to, prefs.timezone);
        if (!stop) store.setExternalEvents(from, to, events);
      } catch (e) {
        console.warn("[canvas] calendar refresh failed", e);
      }
    };
    void load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [date, store, prefs.timezone, mode, g.connected, g.canReadCalendar, g.selectedCalendars.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
