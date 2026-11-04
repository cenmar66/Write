// Durable background work on a Postgres queue (ip_jobs): idempotent enqueue by key,
// claimed with SKIP LOCKED, retried with exponential backoff, dead-lettered after
// max_attempts. Drained by /api/cron/inbox (Vercel Cron) — see docs/inbox/OPERATIONS.md.

import type { Db } from "../db";
import { dueSlot } from "../briefing";
import type { AccountRow, Preferences } from "../types";
import { DEFAULT_PREFERENCES } from "../types";
import { generateBriefing } from "./briefing";
import { pruneBodies, syncAccount } from "./sync";

export interface JobRow {
  id: string;
  kind: "sync" | "classify" | "briefing" | "followups" | "prune";
  workspace_id: string | null;
  account_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export async function enqueue(db: Db, job: { kind: JobRow["kind"]; key: string; workspace_id?: string | null; account_id?: string | null; payload?: Record<string, unknown>; runAfter?: Date }) {
  await db.from("ip_jobs").upsert(
    { kind: job.kind, idempotency_key: job.key, workspace_id: job.workspace_id ?? null, account_id: job.account_id ?? null, payload: job.payload ?? {}, run_after: (job.runAfter ?? new Date()).toISOString() },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
}

async function prefsFor(db: Db, userId: string): Promise<Preferences> {
  const { data } = await db.from("ip_preferences").select("*").eq("user_id", userId).maybeSingle();
  return { ...DEFAULT_PREFERENCES, user_id: userId, ...(data ?? {}) } as Preferences;
}

/** Schedules this tick's work: a sync per active account (every 10 min slot) and due briefings. */
export async function scheduleTick(db: Db, now = new Date()) {
  const slot = new Date(Math.floor(now.getTime() / 600_000) * 600_000).toISOString();
  const { data: accounts } = await db.from("ip_accounts").select("id,workspace_id,user_id,status").in("status", ["active", "syncing", "error"]);
  for (const a of accounts ?? []) await enqueue(db, { kind: "sync", key: `sync:${a.id}:${slot}`, workspace_id: a.workspace_id, account_id: a.id });

  const users = [...new Set((accounts ?? []).map((a) => a.user_id as string))];
  for (const userId of users) {
    const prefs = await prefsFor(db, userId);
    const { data: recent } = await db.from("ip_briefings").select("slot,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
    const lastBySlot: Record<string, string> = {};
    for (const b of recent ?? []) lastBySlot[b.slot as string] ??= b.created_at as string;
    const due = dueSlot(prefs.briefing, prefs.timezone, now, lastBySlot);
    if (due) await enqueue(db, { kind: "briefing", key: `brief:${userId}:${due}:${now.toISOString().slice(0, 10)}`, payload: { userId, slot: due } });
  }
  await enqueue(db, { kind: "prune", key: `prune:${now.toISOString().slice(0, 13)}` });
}

export async function runJob(db: Db, job: JobRow, now = new Date()): Promise<void> {
  if (job.kind === "sync" && job.account_id) {
    const { data: acc } = await db.from("ip_accounts").select("*").eq("id", job.account_id).maybeSingle();
    if (!acc || acc.status === "needs_reconnect" || acc.status === "paused") return;
    const res = await syncAccount(db, db, acc as AccountRow, await prefsFor(db, acc.user_id), { budgetMs: 25_000, now });
    if (res.error && !/re-sync was scheduled/.test(res.error)) throw new Error(res.error);
    return;
  }
  if (job.kind === "briefing") {
    const userId = String(job.payload.userId);
    const { data: mem } = await db.from("ip_memberships").select("workspace_id").eq("user_id", userId);
    await generateBriefing(db, userId, (mem ?? []).map((m) => m.workspace_id as string), await prefsFor(db, userId), job.payload.slot as "morning", { now });
    return;
  }
  if (job.kind === "prune") {
    await pruneBodies(db);
    return;
  }
}

/** Claims and runs ready jobs until the time budget is used. */
export async function drain(db: Db, budgetMs = 50_000) {
  const started = Date.now();
  const results: { id: string; kind: string; ok: boolean; error?: string }[] = [];
  while (Date.now() - started < budgetMs) {
    const { data: jobs, error } = await db.rpc("ip_claim_jobs", { n: 3, lease_seconds: 240 });
    if (error) throw new Error(error.message);
    if (!jobs?.length) break;
    for (const job of jobs as JobRow[]) {
      try {
        await runJob(db, job);
        await db.rpc("ip_finish_job", { job: job.id, ok: true });
        results.push({ id: job.id, kind: job.kind, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.rpc("ip_finish_job", { job: job.id, ok: false, err: msg });
        results.push({ id: job.id, kind: job.kind, ok: false, error: msg });
      }
    }
  }
  return results;
}
