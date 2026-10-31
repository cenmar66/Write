// Workspace access, preferences and small shared helpers for InboxPilot routes.

import type { Db, InboxCtx } from "../db";
import { SYSTEM_CATEGORIES } from "../classify";
import { resolveEntitlement, type Entitlement } from "../entitlements";
import { DEFAULT_PREFERENCES, type AccountRow, type Preferences, type WorkspaceRow } from "../types";

export async function loadPrefs(ctx: Pick<InboxCtx, "db" | "userId">): Promise<Preferences> {
  const { data } = await ctx.db.from("ip_preferences").select("*").eq("user_id", ctx.userId).maybeSingle();
  if (data) return { ...DEFAULT_PREFERENCES, ...data, briefing: { ...DEFAULT_PREFERENCES.briefing, ...(data.briefing ?? {}) }, focus: { ...DEFAULT_PREFERENCES.focus, ...(data.focus ?? {}) } } as Preferences;
  const row = { user_id: ctx.userId, ...DEFAULT_PREFERENCES };
  await ctx.db.from("ip_preferences").upsert(row, { onConflict: "user_id", ignoreDuplicates: true });
  return row;
}

export async function myWorkspaces(ctx: Pick<InboxCtx, "db" | "userId">): Promise<(WorkspaceRow & { role: string })[]> {
  const { data: mem } = await ctx.db.from("ip_memberships").select("workspace_id,role").eq("user_id", ctx.userId);
  const ids = (mem ?? []).map((m) => m.workspace_id as string);
  if (!ids.length) return [];
  const { data } = await ctx.db.from("ip_workspaces").select("*").in("id", ids).order("created_at");
  return ((data ?? []) as WorkspaceRow[]).map((w) => ({ ...w, role: String(mem!.find((m) => m.workspace_id === w.id)?.role ?? "member") }));
}

/** Server-side membership check (RLS also enforces it; this gives a clean 403). */
export async function requireWorkspace(ctx: Pick<InboxCtx, "db" | "userId">, workspaceId: string | null | undefined, opts: { admin?: boolean } = {}) {
  if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new HttpError(400, "Choose a workspace.");
  const { data } = await ctx.db.from("ip_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", ctx.userId).maybeSingle();
  if (!data) throw new HttpError(403, "You don't have access to that workspace.");
  if (opts.admin && !["owner", "admin"].includes(String(data.role))) throw new HttpError(403, "Only workspace admins can do that.");
  const { data: ws } = await ctx.db.from("ip_workspaces").select("*").eq("id", workspaceId).maybeSingle();
  return ws as WorkspaceRow;
}

export async function requireAccount(ctx: Pick<InboxCtx, "db" | "userId">, accountId: string | null | undefined): Promise<AccountRow> {
  if (!accountId) throw new HttpError(400, "Missing account.");
  const { data } = await ctx.db.from("ip_accounts").select("*").eq("id", accountId).maybeSingle();
  if (!data) throw new HttpError(404, "Account not found.");
  await requireWorkspace(ctx, data.workspace_id);
  return data as AccountRow;
}

export async function entitlementFor(db: Db, workspaceId: string): Promise<Entitlement> {
  const { data } = await db.from("ip_subscription_entitlements").select("*").eq("workspace_id", workspaceId).maybeSingle();
  return resolveEntitlement(data);
}

export async function createWorkspace(ctx: Pick<InboxCtx, "db" | "userId">, input: { name: string; kind: WorkspaceRow["kind"]; is_demo?: boolean }) {
  const { data, error } = await ctx.db.from("ip_workspaces").insert({ name: input.name.slice(0, 80) || "Workspace", kind: input.kind, owner_id: ctx.userId, is_demo: !!input.is_demo }).select().single();
  if (error) throw new HttpError(500, error.message);
  await ensureCategories(ctx.db, data.id);
  return data as WorkspaceRow;
}

export async function ensureCategories(db: Db, workspaceId: string) {
  await db.from("ip_categories").upsert(
    SYSTEM_CATEGORIES.map((c, i) => ({ workspace_id: workspaceId, key: c.key, name: c.name, icon: c.icon, position: i, system: true })),
    { onConflict: "workspace_id,key", ignoreDuplicates: true },
  );
}

export async function audit(db: Db, workspaceId: string | null, actor: "user" | "system" | "ai" | "rule" | "assistant", action: string, target: string | null = null, detail: Record<string, unknown> = {}) {
  await db.from("ip_audit_events").insert({ workspace_id: workspaceId, actor, action, target, detail });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a route body: auth context + uniform error responses. */
export async function handle<T>(fn: (ctx: InboxCtx) => Promise<T>): Promise<Response> {
  const { inboxContext } = await import("../db");
  const ctx = await inboxContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    const out = await fn(ctx);
    return out instanceof Response ? out : Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("InboxPilot route failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 });
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (text.length > 200_000) throw new HttpError(413, "Request too large.");
    return (text ? JSON.parse(text) : {}) as T;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid JSON.");
  }
}

// Per-instance rate limit (best effort on serverless; Supabase adds its own limits).
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs = 60_000) {
  const t = Date.now();
  const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
  list.push(t);
  hits.set(key, list);
  if (list.length > max) throw new HttpError(429, "Too many requests. Try again in a minute.");
}

export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
