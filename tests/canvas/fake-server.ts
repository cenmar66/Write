// An in-memory stand-in for Supabase that follows the same rules as
// public.canvas_push (see the SQL tests for the real thing): deterministic ids,
// protected-field conflicts, append-only ledger, increasing sync_seq.
import { PROTECTED_FIELDS, type TableName } from "@/lib/canvas/types";

type Row = Record<string, unknown> & { id: string; version: number; sync_seq: number };

export class FakeServer {
  tables = new Map<string, Map<string, Row>>();
  seq = 0;
  online = true;
  pushes = 0;

  private t(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }
  rows(name: string) {
    return [...this.t(name).values()];
  }

  push(mutations: { table: TableName; id: string; patch: Record<string, unknown>; base?: Record<string, unknown> }[]) {
    this.pushes++;
    const out: unknown[] = [];
    for (const m of mutations) {
      const tbl = this.t(m.table);
      const cur = tbl.get(m.id);
      const patch = { ...m.patch };
      delete patch.version;
      delete patch.sync_seq;
      if (!cur) {
        const row = { ...patch, id: m.id, version: 1, sync_seq: ++this.seq } as Row;
        tbl.set(m.id, row);
        out.push({ id: m.id, table: m.table, status: "ok", row });
        continue;
      }
      if (m.table === "canvas_task_events") {
        out.push({ id: m.id, table: m.table, status: "ok", row: cur });
        continue;
      }
      const conflicts: Record<string, unknown> = {};
      for (const k of Object.keys(m.base ?? {})) {
        if (!(PROTECTED_FIELDS[m.table] ?? []).includes(k)) continue;
        if (k in patch && JSON.stringify(cur[k]) !== JSON.stringify(m.base![k]) && JSON.stringify(cur[k]) !== JSON.stringify(patch[k])) {
          conflicts[k] = { server: cur[k], mine: patch[k] };
          delete patch[k];
        }
      }
      delete patch.id;
      delete patch.created_at;
      const row = { ...cur, ...patch, version: cur.version + 1, sync_seq: ++this.seq } as Row;
      tbl.set(m.id, row);
      out.push({ id: m.id, table: m.table, status: Object.keys(conflicts).length ? "conflict" : "ok", row, conflicts });
    }
    return out;
  }

  /** Just enough of the supabase-js surface used by SyncEngine. */
  client() {
    const net = () => {
      if (!this.online) throw new TypeError("Failed to fetch");
    };
    const push = (m: Parameters<FakeServer["push"]>[0]) => this.push(m);
    const rows = (t: string) => this.rows(t);
    return {
      rpc: async (_fn: string, args: { mutations: Parameters<FakeServer["push"]>[0] }) => {
        net();
        return { data: push(JSON.parse(JSON.stringify(args.mutations))), error: null };
      },
      from: (table: string) => {
        let after = 0;
        let lim = 1000;
        const q = {
          select: () => q,
          gt: (_c: string, v: number) => ((after = v), q),
          order: () => q,
          limit: (n: number) => ((lim = n), q),
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
            try {
              net();
              const data = rows(table)
                .filter((r) => r.sync_seq > after)
                .sort((a, b) => a.sync_seq - b.sync_seq)
                .slice(0, lim)
                .map((r) => JSON.parse(JSON.stringify(r)));
              resolve({ data, error: null });
            } catch (e) {
              reject(e);
            }
          },
        };
        return q;
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: async () => {},
    };
  }
}
