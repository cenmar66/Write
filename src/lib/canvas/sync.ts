// Background sync between the device store and Supabase.
// Push: send queued changes to canvas_push (idempotent; safe to replay after a crash).
// Pull: fetch rows with sync_seq above the last seen value, per table. A small overlap
//       is re-read each time so rows committed slightly out of order are never missed;
//       re-applying a row is harmless.
// Triggers: start-up, any local change (debounced), reconnect, tab focus, a realtime
//           ping from another device, and a slow timer as a safety net.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanvasStore, PushResult } from "./store";
import { SYNCED_TABLES, type TableName } from "./types";

export interface SyncStatus {
  mode: "cloud" | "local-only";
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  error: string | null;
}

const OVERLAP = 500;
const PAGE = 1000;

export class SyncEngine {
  status: SyncStatus;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private again = false;
  private backoff = 0;
  private channel: ReturnType<SupabaseClient["channel"]> | null = null;
  private cleanup: (() => void)[] = [];

  constructor(
    private store: CanvasStore,
    private supabase: SupabaseClient | null,
    private userId: string | null,
  ) {
    this.status = {
      mode: supabase && userId ? "cloud" : "local-only",
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      syncing: false,
      pending: store.pendingCount(),
      lastSyncAt: null,
      error: null,
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getStatus = () => this.status;
  private set(p: Partial<SyncStatus>) {
    this.status = { ...this.status, ...p, pending: this.store.pendingCount() };
    this.listeners.forEach((l) => l());
  }

  async start() {
    this.status.lastSyncAt = (await this.store.getMeta<string>("lastSyncAt")) ?? null;
    this.store.onChange = () => {
      this.set({});
      this.schedule(800);
    };
    if (this.status.mode === "local-only") {
      this.set({});
      return;
    }
    const on = () => {
      this.set({ online: true });
      this.schedule(0);
    };
    const off = () => this.set({ online: false });
    const vis = () => document.visibilityState === "visible" && this.schedule(0);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", vis);
    this.cleanup.push(() => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", vis);
    });
    this.interval = setInterval(() => this.schedule(0), 60_000);

    // Realtime is only a hint to pull sooner; the pull itself is the source of truth.
    try {
      this.channel = this.supabase!.channel(`canvas-${this.userId}`);
      for (const t of ["canvas_tasks", "canvas_task_placements", "canvas_notes", "canvas_water", "canvas_ink", "canvas_appointments", "canvas_preferences"]) {
        this.channel.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `user_id=eq.${this.userId}` }, () =>
          this.schedule(400),
        );
      }
      this.channel.subscribe();
    } catch {
      /* realtime optional */
    }
    this.schedule(0);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
    this.cleanup.forEach((f) => f());
    if (this.channel) void this.supabase?.removeChannel(this.channel);
    this.store.onChange = null;
  }

  schedule(ms: number) {
    if (this.status.mode === "local-only") return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  async syncNow() {
    if (this.status.mode === "local-only") return;
    await this.run();
  }

  private async run() {
    if (this.running) {
      this.again = true;
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.set({ online: false });
      return;
    }
    this.running = true;
    this.set({ syncing: true });
    try {
      await this.push();
      await this.pull();
      const at = new Date().toISOString();
      void this.store.setMeta("lastSyncAt", at);
      this.backoff = 0;
      this.set({ syncing: false, online: true, error: null, lastSyncAt: at });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const offline = /fetch|network|Failed to fetch|Load failed/i.test(msg);
      this.backoff = Math.min(60_000, this.backoff ? this.backoff * 2 : 2_000);
      this.set({ syncing: false, error: offline ? null : msg, online: offline ? false : this.status.online });
      this.schedule(this.backoff);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.schedule(300);
      }
    }
  }

  private async push() {
    for (let round = 0; round < 20; round++) {
      const batch = this.store.takeBatch(200);
      if (!batch.length) return;
      const { data, error } = await this.supabase!.rpc("canvas_push", { mutations: batch.map((b) => b.mutation) });
      if (error) throw new Error(error.message);
      await this.store.settle(
        batch.map((b) => b.entry),
        (data ?? []) as PushResult[],
      );
      this.set({});
    }
  }

  private async pull() {
    for (const table of SYNCED_TABLES) await this.pullTable(table);
  }

  private async pullTable(table: TableName) {
    const metaKey = `cursor:${table}`;
    const cursor = (await this.store.getMeta<number>(metaKey)) ?? 0;
    let from = Math.max(0, cursor - OVERLAP);
    let max = cursor;
    for (let page = 0; page < 50; page++) {
      const { data, error } = await this.supabase!.from(table).select("*").gt("sync_seq", from).order("sync_seq").limit(PAGE);
      if (error) throw new Error(`${table}: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      this.store.applyServerRows(table, rows);
      for (const r of rows) max = Math.max(max, Number(r.sync_seq ?? 0));
      if (rows.length < PAGE) break;
      from = Number(rows[rows.length - 1].sync_seq);
    }
    if (max !== cursor) await this.store.setMeta(metaKey, max);
  }
}
