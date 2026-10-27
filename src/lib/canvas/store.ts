// Local-first store. Every change lands in memory and IndexedDB first (so the planner
// works offline and feels instant), and is queued in an outbox for the sync engine.
//
// Three-way merge model:
//   shadow  = the last server version of each record this device saw
//   outbox  = the device's not-yet-confirmed changes (field patches, merged per record)
//   local   = shadow + outbox  (what the UI shows)
// When the server sends a newer row, the UI shows that row with pending local edits
// laid on top, so neither side's change disappears. Protected text fields send the
// shadow value as their "base"; the server refuses to overwrite text that changed
// elsewhere and the device records a Conflict for the person to resolve.

import { openCanvasDB, type CanvasDB } from "./idb";
import {
  PROTECTED_FIELDS,
  SYNCED_TABLES,
  type BaseRecord,
  type Conflict,
  type ExternalEvent,
  type ISODate,
  type TableName,
  type TableTypes,
} from "./types";

export interface OutboxEntry {
  key: string;
  table: TableName;
  id: string;
  patch: Record<string, unknown>;
  create: boolean;
  queuedAt: number;
  rev: number;
}

interface ShadowEntry {
  key: string;
  version: number;
  fields: Record<string, unknown>;
}

export interface PushResult {
  id: string;
  table: TableName;
  status: "ok" | "conflict" | "rejected";
  row?: Record<string, unknown>;
  conflicts?: Record<string, { server: unknown; mine: unknown }>;
}

type Listener = () => void;
const k = (table: string, id: string) => `${table}:${id}`;
const nowISO = () => new Date().toISOString();

export class CanvasStore {
  readonly userKey: string;
  private db: CanvasDB | null = null;
  private data = new Map<TableName, Map<string, BaseRecord>>();
  private outbox = new Map<string, OutboxEntry>();
  private shadow = new Map<string, ShadowEntry>();
  private conflictMap = new Map<string, Conflict>();
  private ext = new Map<string, ExternalEvent>();
  private loadedInkDates = new Set<ISODate>();
  private listeners = new Set<Listener>();
  private writeChain: Promise<unknown> = Promise.resolve();
  private revCounter = 0;
  private emitQueued = false;
  rev = 0;
  ready = false;
  onChange: (() => void) | null = null; // sync engine hook: something was queued

  constructor(userKey: string) {
    this.userKey = userKey;
    for (const t of SYNCED_TABLES) this.data.set(t, new Map());
  }

  // ---- lifecycle -------------------------------------------------------------
  async load() {
    this.db = await openCanvasDB(this.userKey);
    const tx = this.db.transaction([...SYNCED_TABLES.filter((t) => t !== "canvas_ink"), "outbox", "shadow", "conflicts", "ext_events"]);
    for (const t of SYNCED_TABLES) {
      if (t === "canvas_ink") continue;
      const rows = (await tx.objectStore(t).getAll()) as BaseRecord[];
      const m = this.data.get(t)!;
      for (const r of rows) m.set(r.id, r);
    }
    for (const e of (await tx.objectStore("outbox").getAll()) as OutboxEntry[]) {
      this.outbox.set(e.key, e);
      this.revCounter = Math.max(this.revCounter, e.rev);
    }
    for (const s of (await tx.objectStore("shadow").getAll()) as ShadowEntry[]) this.shadow.set(s.key, s);
    for (const c of (await tx.objectStore("conflicts").getAll()) as Conflict[]) this.conflictMap.set(c.key, c);
    for (const e of (await tx.objectStore("ext_events").getAll()) as ExternalEvent[]) this.ext.set(e.key, e);
    await tx.done;
    this.ready = true;
    this.emit();
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getRev = () => this.rev;

  private emit() {
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      this.rev++;
      this.listeners.forEach((l) => l());
    });
  }

  /** Serialise IndexedDB writes so they land in the order they happened. */
  private persist(fn: (db: CanvasDB) => Promise<unknown>) {
    const db = this.db;
    if (!db) return Promise.resolve();
    this.writeChain = this.writeChain.then(() => fn(db)).catch((e) => console.error("[canvas] save failed", e));
    return this.writeChain;
  }
  flush() {
    return this.writeChain;
  }

  // ---- reads -------------------------------------------------------------------
  get<T extends TableName>(table: T, id: string): TableTypes[T] | undefined {
    return this.data.get(table)!.get(id) as TableTypes[T] | undefined;
  }
  /** Live (not deleted) rows. */
  all<T extends TableName>(table: T): TableTypes[T][] {
    const out: TableTypes[T][] = [];
    for (const r of this.data.get(table)!.values()) if (!r.deleted_at) out.push(r as TableTypes[T]);
    return out;
  }
  /** Including soft-deleted rows (for history and exports). */
  allWithDeleted<T extends TableName>(table: T): TableTypes[T][] {
    return [...this.data.get(table)!.values()] as TableTypes[T][];
  }
  pendingCount() {
    return this.outbox.size;
  }
  isPending(table: TableName, id: string) {
    return this.outbox.has(k(table, id));
  }
  conflicts(): Conflict[] {
    return [...this.conflictMap.values()].sort((a, b) => a.at.localeCompare(b.at));
  }
  externalEvents(date?: ISODate): ExternalEvent[] {
    const all = [...this.ext.values()];
    return date ? all.filter((e) => e.date === date) : all;
  }

  // ---- ink is loaded per day (it's the bulkiest data) -----------------------------
  async ensureInk(date: ISODate) {
    if (this.loadedInkDates.has(date) || !this.db) return;
    this.loadedInkDates.add(date);
    const rows = (await this.db.getAllFromIndex("canvas_ink", "date", date)) as BaseRecord[];
    const m = this.data.get("canvas_ink")!;
    for (const r of rows) if (!m.has(r.id)) m.set(r.id, r);
    this.emit();
  }

  // ---- writes ------------------------------------------------------------------
  /** Create a record. Fields not given use the record's own defaults. */
  create<T extends TableName>(table: T, record: Omit<TableTypes[T], "created_at" | "updated_at" | "version" | "deleted_at"> & Partial<BaseRecord>): TableTypes[T] {
    const existing = this.data.get(table)!.get(record.id);
    if (existing && !existing.deleted_at) return existing as TableTypes[T];
    const ts = nowISO();
    const full = { created_at: ts, updated_at: ts, deleted_at: null, ...record, version: existing?.version ?? 0 } as TableTypes[T];
    this.data.get(table)!.set(full.id, full);
    const { version: _v, sync_seq: _s, user_id: _u, ...patch } = full as unknown as Record<string, unknown>;
    void _v; void _s; void _u;
    this.queue(table, full.id, patch, !existing);
    this.persist((db) => db.put(table, full));
    this.emit();
    return full;
  }

  update<T extends TableName>(table: T, id: string, patch: Partial<TableTypes[T]>) {
    const cur = this.data.get(table)!.get(id);
    if (!cur) return;
    const changed: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(patch)) {
      if (JSON.stringify((cur as unknown as Record<string, unknown>)[key]) !== JSON.stringify(v)) changed[key] = v;
    }
    if (!Object.keys(changed).length) return;
    const next = { ...cur, ...changed, updated_at: nowISO() };
    this.data.get(table)!.set(id, next);
    this.queue(table, id, changed, false);
    this.persist((db) => db.put(table, next));
    this.emit();
  }

  remove(table: TableName, id: string) {
    this.update(table, id, { deleted_at: nowISO() } as never);
  }
  restore(table: TableName, id: string) {
    this.update(table, id, { deleted_at: null } as never);
  }

  private queue(table: TableName, id: string, patch: Record<string, unknown>, create: boolean) {
    const key = k(table, id);
    const prev = this.outbox.get(key);
    const entry: OutboxEntry = {
      key,
      table,
      id,
      patch: { ...(prev?.patch ?? {}), ...patch },
      create: prev ? prev.create : create,
      queuedAt: prev?.queuedAt ?? Date.now(),
      rev: ++this.revCounter,
    };
    this.outbox.set(key, entry);
    this.persist((db) => db.put("outbox", entry));
    this.onChange?.();
  }

  // ---- sync plumbing (used by SyncEngine) -------------------------------------
  /** Next batch to send: parents before children, oldest first. */
  takeBatch(max = 200) {
    const order = new Map(SYNCED_TABLES.map((t, i) => [t, i]));
    const entries = [...this.outbox.values()]
      .sort((a, b) => order.get(a.table)! - order.get(b.table)! || a.queuedAt - b.queuedAt)
      .slice(0, max);
    return entries.map((e) => {
      const protectedKeys = PROTECTED_FIELDS[e.table] ?? [];
      const sh = this.shadow.get(e.key);
      const base: Record<string, unknown> = {};
      if (sh) for (const f of protectedKeys) if (f in e.patch) base[f] = sh.fields[f] ?? null;
      return { entry: { ...e }, mutation: { table: e.table, id: e.id, patch: e.patch, base, create: e.create } };
    });
  }

  /** Apply the server's answer for a batch we sent. */
  async settle(sent: OutboxEntry[], results: PushResult[]) {
    const byKey = new Map(results.map((r) => [k(r.table, r.id), r]));
    for (const e of sent) {
      const r = byKey.get(e.key);
      if (!r) continue;
      const still = this.outbox.get(e.key);
      if (still && still.rev === e.rev) {
        this.outbox.delete(e.key);
        this.persist((db) => db.delete("outbox", e.key));
      } else if (still) {
        // Edited again while in flight: it is no longer a create.
        still.create = false;
        this.persist((db) => db.put("outbox", still));
      }
      if (r.status === "rejected") {
        const local = this.data.get(e.table)!.get(e.id) as unknown as Record<string, unknown> | undefined;
        this.addConflict(e.table, e.id, "_record", local ?? e.patch, null);
        continue;
      }
      if (r.row) this.applyServerRow(e.table, r.row);
      if (r.status === "conflict" && r.conflicts) {
        for (const [field, v] of Object.entries(r.conflicts)) this.addConflict(e.table, e.id, field, v.mine, v.server);
      }
    }
    this.emit();
  }

  private addConflict(table: TableName, id: string, field: string, mine: unknown, server: unknown) {
    const c: Conflict = { key: `${table}:${id}:${field}`, table, id, field, mine, server, at: nowISO() };
    this.conflictMap.set(c.key, c);
    this.persist((db) => db.put("conflicts", c));
  }

  resolveConflict(key: string, choice: "mine" | "server" | "both") {
    const c = this.conflictMap.get(key);
    if (!c) return;
    this.conflictMap.delete(key);
    this.persist((db) => db.delete("conflicts", key));
    if (c.field === "_record") {
      if (choice !== "server" && c.mine && typeof c.mine === "object") {
        const { id: _id, ...rest } = c.mine as Record<string, unknown>;
        void _id;
        this.create(c.table, { ...(rest as object), id: crypto.randomUUID() } as never);
      }
    } else if (choice === "mine") {
      this.update(c.table, c.id, { [c.field]: c.mine } as never);
    } else if (choice === "both") {
      const joined = [String(c.server ?? ""), String(c.mine ?? "")].filter(Boolean).join("\n\n— — —\n\n");
      this.update(c.table, c.id, { [c.field]: joined } as never);
    }
    this.emit();
  }

  /** A row from the server (push result or pull). Keeps pending local edits on top. */
  applyServerRow(table: TableName, row: Record<string, unknown>) {
    const id = String(row.id);
    const key = k(table, id);
    const version = Number(row.version ?? 0);
    const sh = this.shadow.get(key);
    if (sh && sh.version > version) return; // stale (an older read arrived late)
    const fields: Record<string, unknown> = {};
    for (const f of PROTECTED_FIELDS[table] ?? []) fields[f] = row[f];
    const nextShadow = { key, version, fields };
    this.shadow.set(key, nextShadow);
    const pending = this.outbox.get(key);
    const merged = { ...row, ...(pending?.patch ?? {}), version } as unknown as BaseRecord;
    if (table !== "canvas_ink" || this.loadedInkDates.has(String(row.date))) this.data.get(table)!.set(id, merged);
    this.persist(async (db) => {
      await db.put("shadow", nextShadow);
      await db.put(table, merged);
    });
  }

  applyServerRows(table: TableName, rows: Record<string, unknown>[]) {
    for (const r of rows) this.applyServerRow(table, r);
    if (rows.length) this.emit();
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    if (!this.db) return undefined;
    const v = (await this.db.get("meta", key)) as { key: string; value: T } | undefined;
    return v?.value;
  }
  setMeta(key: string, value: unknown) {
    return this.persist((db) => db.put("meta", { key, value }));
  }

  /** Replace cached external calendar events for a date range. */
  setExternalEvents(from: ISODate, to: ISODate, events: ExternalEvent[]) {
    for (const [key, e] of this.ext) if (e.date >= from && e.date <= to) this.ext.delete(key);
    for (const e of events) this.ext.set(e.key, e);
    this.persist(async (db) => {
      const tx = db.transaction("ext_events", "readwrite");
      const all = (await tx.store.getAll()) as ExternalEvent[];
      for (const e of all) if (e.date >= from && e.date <= to) await tx.store.delete(e.key);
      for (const e of events) await tx.store.put(e);
      await tx.done;
    });
    this.emit();
  }
  clearExternalEvents() {
    this.ext.clear();
    this.persist((db) => db.clear("ext_events"));
    this.emit();
  }

  /** Everything, for exports. Loads all ink first. */
  async exportAll() {
    const out: Record<string, unknown[]> = {};
    for (const t of SYNCED_TABLES) {
      out[t] = t === "canvas_ink" && this.db ? await this.db.getAll("canvas_ink") : this.allWithDeleted(t);
    }
    return out;
  }
}
