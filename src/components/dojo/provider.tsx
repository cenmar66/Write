"use client";

import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Profile } from "@/lib/dojo/profiles";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/dojo/store/types";
import { api, readLocal, writeLocal, type Status } from "./client";

type ToastTone = "ok" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

type Ctx = {
  status: Status | null;
  statusError: string | null;
  prefs: Preferences;
  profiles: Profile[];
  ready: boolean;
  savePrefs: (patch: Partial<Preferences>) => Promise<void>;
  reloadProfiles: () => Promise<void>;
  reloadStatus: () => Promise<void>;
  toast: (text: string, tone?: ToastTone) => void;
};

const DojoContext = createContext<Ctx | null>(null);

export function useDojo() {
  const c = useContext(DojoContext);
  if (!c) throw new Error("useDojo outside DojoProvider");
  return c;
}
export function useToast() {
  return useContext(DojoContext)?.toast ?? (() => {});
}

export function DojoProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Cached copy so appearance settings apply instantly on the next visit.
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const { setTheme } = useTheme();

  const toast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const reloadStatus = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/dojo/status"));
      setStatusError(null);
    } catch (e) {
      setStatusError((e as Error).message);
    }
  }, []);
  const reloadProfiles = useCallback(async () => {
    try {
      setProfiles((await api<{ profiles: Profile[] }>("/api/dojo/profiles")).profiles);
    } catch {
      /* shown where profiles are used */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after hydration
    setPrefs(readLocal("pd-prefs", DEFAULT_PREFERENCES));
    (async () => {
      await Promise.all([
        reloadStatus(),
        reloadProfiles(),
        api<{ preferences: Preferences }>("/api/dojo/preferences")
          .then(({ preferences }) => {
            setPrefs(preferences);
            writeLocal("pd-prefs", preferences);
          })
          .catch(() => {}),
      ]);
      setReady(true);
    })();
  }, [reloadStatus, reloadProfiles]);

  const savePrefs = useCallback(
    async (patch: Partial<Preferences>) => {
      setPrefs((p) => {
        const next = { ...p, ...patch };
        writeLocal("pd-prefs", next);
        return next;
      });
      if (patch.theme) setTheme(patch.theme);
      try {
        const { preferences } = await api<{ preferences: Preferences }>("/api/dojo/preferences", { method: "PATCH", body: patch });
        setPrefs(preferences);
        writeLocal("pd-prefs", preferences);
        if (patch.provider !== undefined || patch.model !== undefined) void reloadStatus();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    },
    [setTheme, toast, reloadStatus],
  );

  const value = useMemo(() => ({ status, statusError, prefs, profiles, ready, savePrefs, reloadProfiles, reloadStatus, toast }), [status, statusError, prefs, profiles, ready, savePrefs, reloadProfiles, reloadStatus, toast]);

  return (
    <DojoContext.Provider value={value}>
      <div className="pd-root" data-accent={prefs.accent} data-size={prefs.text_size}>
        {children}
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pd-fade-in pointer-events-auto rounded-full px-4 py-2.5 text-sm font-medium shadow-lg"
              style={{
                background: t.tone === "error" ? "var(--pd-danger)" : "var(--pd-ink)",
                color: "var(--pd-bg)",
              }}
            >
              {t.text}
            </div>
          ))}
        </div>
      </div>
    </DojoContext.Provider>
  );
}
