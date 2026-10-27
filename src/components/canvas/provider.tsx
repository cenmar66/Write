"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/env";
import { Planner } from "@/lib/canvas/actions";
import { deviceTimeZone, isValidTimeZone, localDateOf } from "@/lib/canvas/dates";
import { CanvasStore } from "@/lib/canvas/store";
import { SyncEngine, type SyncStatus } from "@/lib/canvas/sync";
import type { ISODate, Preferences, SectionKey } from "@/lib/canvas/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type View = "day" | "week" | "month";

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface Ctx {
  store: CanvasStore;
  planner: Planner;
  sync: SyncEngine;
  supabase: SupabaseClient | null;
  mode: "cloud" | "local-only";
  email: string | null;
  rev: number;
  prefs: Preferences;
  today: ISODate;
  date: ISODate;
  setDate: (d: ISODate) => void;
  view: View;
  setView: (v: View) => void;
  pencil: boolean;
  setPencil: (v: boolean) => void;
  focus: SectionKey | null;
  setFocus: (k: SectionKey | null) => void;
  toast: (message: string, action?: Toast["action"]) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  captureOpen: boolean;
  setCaptureOpen: (v: boolean) => void;
}

const CanvasContext = createContext<Ctx | null>(null);

export function useCanvas(): Ctx {
  const c = useContext(CanvasContext);
  if (!c) throw new Error("useCanvas must be inside <CanvasProvider>");
  return c;
}

export function useSyncStatus(): SyncStatus {
  const { sync } = useCanvas();
  return useSyncExternalStore(sync.subscribe, sync.getStatus, sync.getStatus);
}

const LOCAL_ONLY = process.env.NEXT_PUBLIC_CANVAS_LOCAL_ONLY === "1";
const supabaseConfigured = !SUPABASE_URL.includes("not-configured");

type Boot =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; store: CanvasStore; planner: Planner; sync: SyncEngine; supabase: SupabaseClient | null; email: string | null };

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    let engine: SyncEngine | null = null;
    (async () => {
      try {
        let supabase: SupabaseClient | null = null;
        let userId: string | null = null;
        let email: string | null = null;
        if (supabaseConfigured && !LOCAL_ONLY) {
          supabase = createClient();
          // getSession reads the local session, so this works offline too.
          const { data } = await supabase.auth.getSession();
          userId = data.session?.user.id ?? null;
          email = data.session?.user.email ?? null;
          if (!userId) {
            window.location.href = "/login?next=/canvas";
            return;
          }
        }
        const userKey = userId ?? "local";
        const store = new CanvasStore(userKey);
        await store.load();
        const planner = new Planner(store, userKey);
        if (!store.get("canvas_preferences", planner.prefsId)) {
          planner.setPrefs({ timezone: deviceTimeZone() });
        }
        engine = new SyncEngine(store, userId ? supabase : null, userId);
        await engine.start();
        if (cancelled) return engine.stop();
        setBoot({ state: "ready", store, planner, sync: engine, supabase, email });
      } catch (e) {
        console.error(e);
        if (!cancelled) setBoot({ state: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
      engine?.stop();
    };
  }, []);

  if (boot.state === "loading") return <BootScreen />;
  if (boot.state === "error")
    return (
      <BootScreen>
        <p className="max-w-sm text-center text-sm">
          The planner couldn&apos;t open its local storage on this device ({boot.message}). Private browsing can block it; try a
          normal window.
        </p>
      </BootScreen>
    );
  return <Ready {...boot}>{children}</Ready>;
}

function BootScreen({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3" style={{ color: "var(--dc-muted)" }}>
      <p className="dc-serif text-2xl" style={{ color: "var(--dc-ink)" }}>
        The Daily Canvas
      </p>
      {children ?? <p className="text-sm">Opening your planner…</p>}
    </div>
  );
}

function Ready({
  store,
  planner,
  sync,
  supabase,
  email,
  children,
}: {
  store: CanvasStore;
  planner: Planner;
  sync: SyncEngine;
  supabase: SupabaseClient | null;
  email: string | null;
  children: React.ReactNode;
}) {
  const rev = useSyncExternalStore(store.subscribe, store.getRev, store.getRev);
  const prefs = useMemo(() => planner.prefs(), [planner, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const tz = isValidTimeZone(prefs.timezone) ? prefs.timezone : deviceTimeZone();
  const [today, setToday] = useState<ISODate>(() => localDateOf(new Date(), tz));
  const [date, setDateState] = useState<ISODate>(today);
  const [view, setView] = useState<View>("day");
  const [pencil, setPencil] = useState(false);
  const [focus, setFocus] = useState<SectionKey | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const toastId = useRef(0);
  const prevToday = useRef(today);

  // Keep "today" right as midnight passes or the timezone setting changes.
  useEffect(() => {
    const tick = () => setToday(localDateOf(new Date(), tz));
    tick();
    const t = setInterval(tick, 30_000);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [tz]);

  useEffect(() => {
    if (prevToday.current !== today) {
      // Follow the new day if the person was looking at the old "today".
      setDateState((d) => (d === prevToday.current ? today : d));
      prevToday.current = today;
    }
  }, [today]);

  // Morning planning (rollover + recurring occurrences). Re-run after each sync so a
  // fresh device picks up tasks from the cloud; it is idempotent.
  const status = useSyncExternalStore(sync.subscribe, sync.getStatus, sync.getStatus);
  useEffect(() => {
    planner.planDay(today);
  }, [planner, today, status.lastSyncAt]);

  // Ask the browser to keep our storage (helps iOS not evict offline data).
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {});
  }, []);

  const toast = useCallback((message: string, action?: Toast["action"]) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const value: Ctx = {
    store,
    planner,
    sync,
    supabase,
    mode: status.mode,
    email,
    rev,
    prefs,
    today,
    date,
    setDate: setDateState,
    view,
    setView,
    pencil,
    setPencil,
    focus,
    setFocus,
    toast,
    toasts,
    dismissToast,
    captureOpen,
    setCaptureOpen,
  };
  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}
