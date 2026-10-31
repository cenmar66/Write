// Server-only plumbing shared by every /api/dojo route: who is calling, which store to
// use, request validation, limits, provider selection and usage recording.
import type { z } from "zod";
import { isAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, rateLimit, startOfDay, startOfMonth } from "./limits";
import { resolveProvider, type ProviderChoice } from "./providers";
import { ServiceError, type UsageRecord } from "./services";
import { memoryStore, supabaseStore, type DojoStore } from "./store";

/** Dev/test only: no sign-in, data in server memory. Ignored in production builds. */
export function localMode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DOJO_LOCAL_ONLY === "1";
}

export type DojoCtx = { store: DojoStore; userId: string };

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function dojoContext(): Promise<DojoCtx | { denied: Response }> {
  if (localMode()) return { store: memoryStore("local"), userId: "local" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !isAllowed(claims.email as string | undefined)) return { denied: jsonError("You've been signed out. Sign in again.", 401) };
  return { store: supabaseStore(supabase, claims.sub), userId: claims.sub };
}

/** Reads and validates a JSON body with a size limit. */
export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<{ data: z.infer<S> } | { denied: Response }> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > LIMITS.maxBodyBytes) return { denied: jsonError("That request is too large.", 413) };
  const raw = await request.text().catch(() => "");
  if (raw.length > LIMITS.maxBodyBytes) return { denied: jsonError("That request is too large.", 413) };
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return { denied: jsonError("The request wasn't valid JSON.", 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Custom messages are written for people; generic ones get the field name.
    const generic = issue && /^(Invalid|Expected|Too (big|small)|Unrecognized)/i.test(issue.message);
    return { denied: jsonError(issue ? (generic ? `${issue.path.join(".") || "request"}: ${issue.message}` : issue.message) : "Invalid request.", 400) };
  }
  return { data: parsed.data };
}

/** Per-minute, per-day and monthly-budget checks before any paid AI call. */
export async function checkLimits(ctx: DojoCtx, bucket: string): Promise<Response | null> {
  const wait = rateLimit(`${ctx.userId}:${bucket}`);
  if (wait) return jsonError(`Slow down a little — try again in ${wait}s.`, 429, { retryable: true, retryAfter: wait });
  const [day, month] = await Promise.all([
    LIMITS.perDay ? ctx.store.usageSince(startOfDay()) : null,
    LIMITS.monthlyBudgetUsd ? ctx.store.usageSince(startOfMonth()) : null,
  ]);
  if (day && LIMITS.perDay && day.requests >= LIMITS.perDay) return jsonError(`Daily limit reached (${LIMITS.perDay} AI requests). It resets at midnight UTC, or raise DOJO_DAILY_REQUEST_LIMIT.`, 429, { code: "daily_limit" });
  if (month && LIMITS.monthlyBudgetUsd && month.costUsd >= LIMITS.monthlyBudgetUsd)
    return jsonError(`Monthly AI budget reached ($${LIMITS.monthlyBudgetUsd}). Raise DOJO_MONTHLY_BUDGET_USD to continue.`, 429, { code: "budget" });
  return null;
}

export function notConfigured() {
  return jsonError("No AI provider is connected yet. Add ANTHROPIC_API_KEY (or another provider) to the server environment.", 503, { code: "not_configured" });
}

export async function pickProvider(ctx: DojoCtx, choice?: { provider?: string; model?: string }): Promise<ProviderChoice | null> {
  if (choice?.provider) return resolveProvider(choice);
  const prefs = await ctx.store.getPreferences();
  return resolveProvider({ provider: prefs.provider, model: prefs.model });
}

export async function recordUsage(ctx: DojoCtx, records: UsageRecord[]) {
  await ctx.store.recordUsage(
    records.map((r) => ({ kind: r.kind, provider: r.provider, model: r.model, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUsd })),
  );
}

/** Turns service errors into responses, recording any usage they consumed. */
export async function serviceFailure(ctx: DojoCtx, error: unknown): Promise<Response> {
  if (error instanceof ServiceError) {
    await recordUsage(ctx, error.usage);
    return jsonError(error.message, error.status, { retryable: error.retryable });
  }
  console.error("[dojo] unexpected error", error instanceof Error ? error.name : typeof error);
  return jsonError(error instanceof Error && error.message.startsWith("Couldn't") ? error.message : "Something went wrong. Try again.", 500, { retryable: true });
}

/** Public provider + usage info returned with AI results. */
export function servedBy(r: { provider: string; providerLabel: string; model: string; isMock: boolean; usage: UsageRecord[] }) {
  const u = r.usage.reduce(
    (a, x) => ({ inputTokens: a.inputTokens + (x.inputTokens ?? 0), outputTokens: a.outputTokens + (x.outputTokens ?? 0), costUsd: x.costUsd === null || a.costUsd === null ? null : a.costUsd + x.costUsd }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 as number | null },
  );
  return { provider: r.provider, providerLabel: r.providerLabel, model: r.model, isMock: r.isMock, usage: u };
}
