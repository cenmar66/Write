// In-memory stand-in for the parts of supabase-js InboxPilot uses. Used for:
//  * local demo mode (INBOX_LOCAL_DEMO=1, development only, never in production builds)
//  * integration tests of the sync → classify → rules → follow-ups → briefing pipeline.
// It mirrors the SQL schema's defaults, unique keys and cascades closely enough for
// those purposes. Row-level security is tested separately against real Postgres
// (npm run test:sql).

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const now = () => new Date().toISOString();

const DEFAULTS: Record<string, () => Row> = {
  ip_workspaces: () => ({ kind: "personal", is_demo: false, color: "blue" }),
  ip_preferences: () => ({}),
  ip_accounts: () => ({ status: "active", scopes: "", sync_cursor: null, sync_state: {}, last_sync_at: null, last_error: null, automation_mode: null, settings: {}, display_name: null }),
  ip_threads: () => ({ subject: "", last_message_at: null, message_count: 0, participants: [] }),
  ip_messages: () => ({ thread_id: null, rfc_message_id: null, in_reply_to: null, from_email: "", from_name: "", to_addrs: [], cc_addrs: [], reply_to: null, subject: "", snippet: "", body_text: null, body_expires_at: null, label_ids: [], is_unread: false, is_starred: false, is_sent: false, in_inbox: true, has_attachments: false, attachments: [], list_id: null, list_unsubscribe: null, auto_submitted: null, precedence: null, signals: {}, category: null, importance: null, priority_score: 0, snoozed_until: null, snooze_until_reply: false, done_at: null }),
  ip_classifications: () => ({ explanation: "", factors: [], model: null, injection_flag: false, user_corrected: false }),
  ip_senders: () => ({ display_name: "", is_vip: false, always_priority: false, suppress_notifications: false, screening: "unknown", default_category: null, blocked: false, received_count: 0, replied_count: 0, sent_to_count: 0, first_seen: null, last_seen: null }),
  ip_categories: () => ({ icon: "tag", position: 0, system: false, hidden: false }),
  ip_rules: () => ({ account_id: null, enabled: true, priority: 100, match: "all", conditions: [], actions: [], stop_processing: false, origin: "user", confirmed_broad: false }),
  ip_rule_executions: () => ({ rule_id: null, rule_name: "", provider_applied: false, undo: null, error: null }),
  ip_tasks: () => ({ account_id: null, message_id: null, source_ref: null, description: "", due_date: null, priority: "normal", project: null, assignee: null, status: "open", notes: "", provenance: {}, external_refs: {}, dedupe_key: null, completed_at: null }),
  ip_followups: () => ({ account_id: null, thread_id: null, message_id: null, counterpart: "", due_at: null, due_explicit: false, evidence: "", confidence: 0.5, detected_by: "rule", status: "open", snoozed_until: null, tracking_disabled: false, assignee: null }),
  ip_reminders: () => ({ note: "", status: "pending", dedupe_key: null }),
  ip_briefings: () => ({ workspace_ids: [], summary_source: "deterministic", model: null }),
  ip_drafts: () => ({ message_id: null, provider_thread_id: null, to_addrs: [], cc_addrs: [], bcc_addrs: [], subject: "", body: "", language: "en", ai_generated: false, status: "draft", sent_at: null, provider_message_id: null, error: null }),
  ip_audit_events: () => ({ detail: {}, target: null }),
  ip_ai_usage: () => ({ input_tokens: 0, output_tokens: 0, cost_usd: 0, cached: false, ok: true }),
  ip_subscription_entitlements: () => ({ plan: "dev", source: "dev", status: "active", overrides: {} }),
  ip_jobs: () => ({ payload: {}, status: "queued", attempts: 0, max_attempts: 5, run_after: now(), locked_until: null, last_error: null }),
  ip_provider_tokens: () => ({ access_token_enc: null, refresh_token_enc: null, expires_at: null, scopes: "" }),
  ip_notification_preferences: () => ({ account_id: null, channels: ["in_app"], schedule: {}, quiet: false }),
  ip_classification_feedback: () => ({ message_id: null, old_value: null }),
  ip_memberships: () => ({ role: "member" }),
};

const PK: Record<string, string[]> = {
  ip_preferences: ["user_id"],
  ip_provider_tokens: ["account_id"],
  ip_classifications: ["message_id"],
  ip_subscription_entitlements: ["workspace_id"],
  ip_memberships: ["workspace_id", "user_id"],
};
const UNIQUE: Record<string, string[][]> = {
  ip_accounts: [["workspace_id", "provider", "email"]],
  ip_threads: [["account_id", "provider_thread_id"]],
  ip_messages: [["account_id", "provider_message_id"]],
  ip_senders: [["workspace_id", "email"]],
  ip_categories: [["workspace_id", "key"]],
  ip_rule_executions: [["rule_id", "message_id", "action"]],
  ip_tasks: [["workspace_id", "dedupe_key"]],
  ip_followups: [["workspace_id", "dedupe_key"]],
  ip_reminders: [["workspace_id", "dedupe_key"]],
  ip_jobs: [["idempotency_key"]],
};
/** parent table → [child table, fk column, on delete]. */
const CASCADE: Record<string, [string, string, "cascade" | "null"][]> = {
  ip_workspaces: ["ip_memberships", "ip_accounts", "ip_threads", "ip_messages", "ip_classifications", "ip_classification_feedback", "ip_senders", "ip_categories", "ip_rules", "ip_rule_executions", "ip_tasks", "ip_followups", "ip_reminders", "ip_drafts", "ip_notification_preferences", "ip_audit_events", "ip_ai_usage", "ip_subscription_entitlements", "ip_jobs"].map((t) => [t, "workspace_id", "cascade"] as [string, string, "cascade"]),
  ip_accounts: [["ip_provider_tokens", "account_id", "cascade"], ["ip_threads", "account_id", "cascade"], ["ip_messages", "account_id", "cascade"], ["ip_rules", "account_id", "cascade"], ["ip_tasks", "account_id", "cascade"], ["ip_followups", "account_id", "cascade"], ["ip_drafts", "account_id", "cascade"], ["ip_notification_preferences", "account_id", "cascade"], ["ip_jobs", "account_id", "cascade"]],
  ip_threads: [["ip_messages", "thread_id", "null"], ["ip_followups", "thread_id", "cascade"]],
  ip_messages: [["ip_classifications", "message_id", "cascade"], ["ip_classification_feedback", "message_id", "null"], ["ip_rule_executions", "message_id", "cascade"], ["ip_tasks", "message_id", "null"], ["ip_followups", "message_id", "cascade"], ["ip_drafts", "message_id", "null"]],
  ip_rules: [["ip_rule_executions", "rule_id", "null"]],
};

const keyOf = (r: Row, cols: string[]) => (cols.every((c) => r[c] != null) ? cols.map((c) => JSON.stringify(r[c])).join("|") : null);
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export class MemoryDb {
  tables = new Map<string, Row[]>();
  seq = 0;
  constructor(readonly user: { id: string; email: string }) {}

  rows(t: string) {
    if (!this.tables.has(t)) this.tables.set(t, []);
    return this.tables.get(t)!;
  }

  from(table: string) {
    return new Query(this, table);
  }

  auth = {
    getClaims: async () => ({ data: { claims: { sub: this.user.id, email: this.user.email } }, error: null }),
    getUser: async () => ({ data: { user: { id: this.user.id, email: this.user.email } }, error: null }),
  };

  async rpc(name: string, args: Record<string, unknown> = {}) {
    if (name === "ip_claim_jobs") {
      const n = Number(args.n ?? 5);
      const lease = Number(args.lease_seconds ?? 240);
      const t = Date.now();
      const ready = this.rows("ip_jobs")
        .filter((j) => (j.status === "queued" && Date.parse(String(j.run_after)) <= t) || (j.status === "running" && Date.parse(String(j.locked_until)) < t))
        .sort((a, b) => String(a.run_after).localeCompare(String(b.run_after)))
        .slice(0, n);
      for (const j of ready) Object.assign(j, { status: "running", attempts: Number(j.attempts) + 1, locked_until: new Date(t + lease * 1000).toISOString(), updated_at: now() });
      return { data: clone(ready), error: null };
    }
    if (name === "ip_finish_job") {
      const j = this.rows("ip_jobs").find((r) => r.id === args.job);
      if (j) {
        if (args.ok) Object.assign(j, { status: "done", locked_until: null, last_error: null });
        else {
          const attempts = Number(j.attempts);
          Object.assign(j, {
            status: attempts >= Number(j.max_attempts) ? "dead" : "queued",
            run_after: new Date(Date.now() + 30_000 * 4 ** Math.min(attempts - 1, 6)).toISOString(),
            locked_until: null,
            last_error: String(args.err ?? "").slice(0, 2000),
          });
        }
      }
      return { data: null, error: null };
    }
    if (name === "ip_delete_my_data") {
      for (const w of this.rows("ip_workspaces").filter((w) => w.owner_id === this.user.id)) this.deleteRow("ip_workspaces", w);
      this.tables.set("ip_briefings", this.rows("ip_briefings").filter((r) => r.user_id !== this.user.id));
      this.tables.set("ip_preferences", this.rows("ip_preferences").filter((r) => r.user_id !== this.user.id));
      return { data: null, error: null };
    }
    return { data: null, error: { message: `Unknown function ${name}` } };
  }

  deleteRow(table: string, row: Row) {
    this.tables.set(table, this.rows(table).filter((r) => r !== row));
    for (const [child, col, mode] of CASCADE[table] ?? []) {
      for (const r of [...this.rows(child)]) {
        if (r[col] !== row.id) continue;
        if (mode === "cascade") this.deleteRow(child, r);
        else r[col] = null;
      }
    }
  }

  prepare(table: string, input: Row): Row {
    const row: Row = { ...(DEFAULTS[table]?.() ?? {}), ...clone(input) };
    if (!PK[table] && row.id == null) row.id = table === "ip_audit_events" || table === "ip_ai_usage" ? ++this.seq : randomUUID();
    if (row.created_at == null) row.created_at = now();
    row.updated_at = now();
    if (table === "ip_preferences" && row.user_id == null) row.user_id = this.user.id;
    if (["ip_accounts", "ip_briefings", "ip_audit_events", "ip_ai_usage"].includes(table) && row.user_id == null) row.user_id = this.user.id;
    if (table === "ip_workspaces" && row.owner_id == null) row.owner_id = this.user.id;
    return row;
  }

  conflictWith(table: string, row: Row, cols?: string[]): Row | undefined {
    const sets = cols ? [cols] : [...(PK[table] ? [PK[table]] : [["id"]]), ...(UNIQUE[table] ?? [])];
    for (const set of sets) {
      const k = keyOf(row, set);
      if (k == null) continue;
      const hit = this.rows(table).find((r) => keyOf(r, set) === k);
      if (hit) return hit;
    }
    return undefined;
  }

  afterInsert(table: string, row: Row) {
    if (table === "ip_workspaces") this.rows("ip_memberships").push({ workspace_id: row.id, user_id: row.owner_id, role: "owner", created_at: now() });
  }
}

class Query implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private opts: { onConflict?: string; ignoreDuplicates?: boolean; count?: string; head?: boolean } = {};
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private lim: number | null = null;
  private offset = 0;
  private pick: "one" | "maybe" | null = null;
  private returning = false;
  private cols: string[] | null = null;

  constructor(private db: MemoryDb, private table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    if (cols && cols !== "*") this.cols = cols.split(",").map((c) => c.trim()).filter(Boolean);
    if (opts) Object.assign(this.opts, opts);
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    Object.assign(this.opts, opts);
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v || (v != null && r[c] != null && String(r[c]) === String(v))); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: null | boolean) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v));
    else if (op === "in") { const list = String(v).replace(/[()]/g, "").split(",").map((s) => s.replace(/"/g, "").trim()); this.filters.push((r) => !list.includes(String(r[c]))); }
    else this.filters.push((r) => r[c] !== v);
    return this;
  }
  gte(c: string, v: unknown) { this.filters.push((r) => r[c] != null && String(r[c]) >= String(v)); return this; }
  gt(c: string, v: unknown) { this.filters.push((r) => r[c] != null && String(r[c]) > String(v)); return this; }
  lte(c: string, v: unknown) { this.filters.push((r) => r[c] != null && String(r[c]) <= String(v)); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => r[c] != null && String(r[c]) < String(v)); return this; }
  ilike(c: string, pattern: string) {
    const re = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "is");
    this.filters.push((r) => re.test(String(r[c] ?? "")));
    return this;
  }
  contains(c: string, vs: unknown[]) { this.filters.push((r) => Array.isArray(r[c]) && vs.every((v) => (r[c] as unknown[]).includes(v))); return this; }
  /** Supports the subset "col.op.value,col.op.value" with ilike/eq/is. */
  or(expr: string) {
    const parts = expr.split(/,(?![^(]*\))/).map((p) => p.trim());
    const tests = parts.map((p) => {
      const [col, op, ...rest] = p.split(".");
      const val = rest.join(".");
      if (op === "ilike") { const re = new RegExp("^" + val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "is"); return (r: Row) => re.test(String(r[col] ?? "")); }
      if (op === "is") return (r: Row) => (val === "null" ? r[col] == null : String(r[col]) === val);
      if (op === "lte") return (r: Row) => r[col] != null && String(r[col]) <= val;
      if (op === "gt") return (r: Row) => r[col] != null && String(r[col]) > val;
      return (r: Row) => String(r[col]) === val;
    });
    this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }
  order(col: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) { this.orders.push({ col, asc: o.ascending !== false, nullsFirst: o.nullsFirst }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.offset = a; this.lim = b - a + 1; return this; }
  maybeSingle() { this.pick = "maybe"; return this; }
  single() { this.pick = "one"; return this; }

  private project(r: Row) {
    if (!this.cols) return clone(r);
    const out: Row = {};
    for (const c of this.cols) if (!c.includes("(")) out[c] = clone(r[c]);
    return out;
  }

  private run() {
    const db = this.db;
    const all = db.rows(this.table);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let result: Row[] = [];
    if (this.op === "insert" || this.op === "upsert") {
      const conflictCols = this.opts.onConflict?.split(",").map((s) => s.trim());
      for (const input of this.payload) {
        const row = db.prepare(this.table, input);
        const existing = db.conflictWith(this.table, row, this.op === "upsert" ? conflictCols : undefined) ?? (this.op === "upsert" && conflictCols ? undefined : db.conflictWith(this.table, row));
        if (existing) {
          if (this.op === "insert") return { data: null, error: { message: `duplicate key value violates unique constraint on ${this.table}`, code: "23505" } };
          if (this.opts.ignoreDuplicates) continue;
          const { id: _id, created_at: _c, ...rest } = clone(input);
          void _id; void _c;
          Object.assign(existing, rest, { updated_at: new Date().toISOString() });
          result.push(existing);
        } else {
          all.push(row);
          db.afterInsert(this.table, row);
          result.push(row);
        }
      }
    } else if (this.op === "update") {
      for (const r of all.filter(match)) Object.assign(r, clone(this.patch), { updated_at: new Date().toISOString() });
      result = all.filter(match);
    } else if (this.op === "delete") {
      result = all.filter(match);
      for (const r of result) db.deleteRow(this.table, r);
    } else {
      result = all.filter(match);
    }
    if (this.orders.length) {
      result = [...result].sort((a, b) => {
        for (const o of this.orders) {
          const av = a[o.col], bv = b[o.col];
          if (av == null && bv == null) continue;
          if (av == null) return o.nullsFirst ? -1 : 1;
          if (bv == null) return o.nullsFirst ? 1 : -1;
          const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
          if (cmp) return o.asc ? cmp : -cmp;
        }
        return 0;
      });
    }
    const count = result.length;
    if (this.lim != null || this.offset) result = result.slice(this.offset, this.offset + (this.lim ?? result.length));
    if (this.opts.head) return { data: null, error: null, count };
    if (this.op !== "select" && !this.returning) return { data: null, error: null, count: this.opts.count ? count : null };
    const data = result.map((r) => this.project(r));
    if (this.pick) {
      if (data.length === 0) return this.pick === "maybe" ? { data: null, error: null } : { data: null, error: { message: "No rows found", code: "PGRST116" } };
      return { data: data[0], error: null };
    }
    return { data, error: null, count: this.opts.count ? count : null };
  }

  then<A = { data: unknown; error: { message: string } | null; count?: number | null }, B = never>(
    ok?: ((v: { data: unknown; error: { message: string; code?: string } | null; count?: number | null }) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    try {
      return Promise.resolve(this.run()).then(ok, fail);
    } catch (e) {
      return Promise.reject(e).then(ok, fail);
    }
  }
}
