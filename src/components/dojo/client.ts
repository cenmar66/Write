"use client";

// Browser-side API helpers for /api/dojo. Errors carry a plain message plus whether a
// retry makes sense; nothing here ever touches API keys.
import type { GenerationRecord, Preferences, PromptRecord, PromptVersion } from "@/lib/dojo/store/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(typeof navigator !== "undefined" && !navigator.onLine ? "You're offline. Your text is saved on this device; try again when you're back online." : "Couldn't reach the server. Check your connection and try again.", 0, true);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; retryable?: boolean; code?: string };
  if (!res.ok) {
    if (res.status === 401) throw new ApiError("You've been signed out. Sign in again (your text is kept on this device).", 401, false, "signed_out");
    throw new ApiError(data.error ?? `Request failed (${res.status}).`, res.status, data.retryable ?? res.status >= 500, data.code);
  }
  return data as T;
}

export type ServedBy = {
  provider: string;
  providerLabel: string;
  model: string;
  isMock: boolean;
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null };
};

export type ProviderStatus = { id: string; label: string; configured: boolean; isMock: boolean; models: { id: string; label: string }[] };

export type Status = {
  providers: ProviderStatus[];
  active: { provider: string; label: string; model: string; isMock: boolean } | null;
  localMode: boolean;
  mock: boolean;
  store: "supabase" | "memory";
  databaseReady: boolean;
  limits: { perMinute: number; perDay: number; monthlyBudgetUsd: number };
  usage: { requests: number; inputTokens: number; outputTokens: number; costUsd: number; unpricedRequests: number; byKind: Record<string, { requests: number; costUsd: number }> } | null;
};

export type { GenerationRecord, Preferences, PromptRecord, PromptVersion };

// ---- Local persistence (drafts survive refreshes and failed requests) -------------------
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: drafts just won't persist */
  }
}

/** Hand-off between pages ("use this in the generator", "test this in the lab"). */
export type Handoff =
  | { to: "generator"; request?: string; prompt?: string; generationId?: string; title?: string }
  | { to: "lab"; prompt: string; promptId?: string; versionId?: string; title?: string }
  | { to: "analyzer"; prompt: string };

export function setHandoff(h: Handoff) {
  try {
    sessionStorage.setItem("pd-handoff", JSON.stringify(h));
  } catch {
    /* ignore */
  }
}
export function takeHandoff<T extends Handoff["to"]>(to: T): Extract<Handoff, { to: T }> | null {
  try {
    const raw = sessionStorage.getItem("pd-handoff");
    if (!raw) return null;
    const h = JSON.parse(raw) as Handoff;
    if (h.to !== to) return null;
    sessionStorage.removeItem("pd-handoff");
    return h as Extract<Handoff, { to: T }>;
  } catch {
    return null;
  }
}

export function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return "cost n/a";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function download(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = () => (isMac() ? "⌘" : "Ctrl");
