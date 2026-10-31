// The one door every InboxPilot AI call goes through:
//  1. consent: the user must have allowed external AI processing,
//  2. quota: monthly request cap per user,
//  3. routing: cheapest adequate model for the feature,
//  4. cache: identical requests within 10 minutes reuse the answer,
//  5. accounting: every call is written to ip_ai_usage with tokens and cost.
// Callers always get {ok:false, reason} instead of an exception, so features fall back
// to their deterministic versions when AI is off or down.

import { createHash } from "node:crypto";
import type { Db } from "../db";
import type { Preferences } from "../types";
import { costUsd, FEATURE_TIER, modelFor, type AiProviderId, type Tier } from "./models";
import { anthropicJson, describeAiError, openAiJson, type JsonProvider } from "./providers";
import { simulatedJson } from "./simulated";

export interface AiCtx {
  db: Db;
  userId: string;
  workspaceId: string | null;
  prefs: Pick<Preferences, "ai_external" | "ai_provider" | "ai_monthly_request_cap">;
}

export type AiResult<T> = { ok: true; data: T; model: string; cached: boolean } | { ok: false; reason: string };

let override: JsonProvider | null = null;
/** Tests can swap in a fake provider. */
export function setProviderForTests(p: JsonProvider | null) {
  override = p;
}

export function simulatedAiEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.INBOX_SIMULATED_AI === "1";
}

function pickProvider(pref: "anthropic" | "openai"): { id: AiProviderId; impl: JsonProvider } | null {
  if (override) return { id: "anthropic", impl: override };
  if (simulatedAiEnabled()) return { id: "simulated", impl: simulatedJson };
  const order: ("anthropic" | "openai")[] = pref === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
  for (const id of order) {
    const impl = id === "openai" ? openAiJson : anthropicJson;
    if (impl.available()) return { id, impl };
  }
  return null;
}

export function aiStatus(prefs: AiCtx["prefs"]): { available: boolean; reason?: string; provider?: string } {
  if (!prefs.ai_external) return { available: false, reason: "AI processing is off. Turn it on in Settings → Privacy & AI." };
  const p = pickProvider(prefs.ai_provider);
  if (!p) return { available: false, reason: "No AI provider is configured on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY)." };
  return { available: true, provider: p.id };
}

const cache = new Map<string, { at: number; data: unknown; model: string }>();
const CACHE_MS = 10 * 60_000;

export async function aiJson<T>(
  ctx: AiCtx,
  feature: keyof typeof FEATURE_TIER | string,
  req: { system: string; user: string; schema: Record<string, unknown>; schemaName: string; maxTokens?: number; tier?: Tier },
): Promise<AiResult<T>> {
  const status = aiStatus(ctx.prefs);
  if (!status.available) return { ok: false, reason: status.reason! };
  const provider = pickProvider(ctx.prefs.ai_provider)!;
  const model = modelFor(provider.id, req.tier ?? FEATURE_TIER[feature] ?? "balanced");
  if (!model) return { ok: false, reason: "No model is configured for this provider." };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await ctx.db.from("ip_ai_usage").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).eq("cached", false).gte("created_at", monthStart.toISOString());
  if ((count ?? 0) >= ctx.prefs.ai_monthly_request_cap) return { ok: false, reason: `Monthly AI limit reached (${ctx.prefs.ai_monthly_request_cap} requests). Raise it in Settings.` };

  const key = createHash("sha256").update(`${model.id}\n${req.schemaName}\n${req.system}\n${req.user}`).digest("hex");
  const hit = cache.get(key);
  const record = (row: { input: number; output: number; cached: boolean; ok: boolean; modelId: string }) =>
    ctx.db.from("ip_ai_usage").insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      feature,
      provider: provider.id,
      model: row.modelId,
      input_tokens: row.input,
      output_tokens: row.output,
      cost_usd: row.cached ? 0 : Number(costUsd(model, row.input, row.output).toFixed(6)),
      cached: row.cached,
      ok: row.ok,
    });
  if (hit && Date.now() - hit.at < CACHE_MS) {
    await record({ input: 0, output: 0, cached: true, ok: true, modelId: hit.model });
    return { ok: true, data: hit.data as T, model: hit.model, cached: true };
  }
  try {
    const out = await provider.impl.generate({ model, system: req.system, user: req.user, schema: req.schema, schemaName: req.schemaName, maxTokens: req.maxTokens ?? 2000 });
    cache.set(key, { at: Date.now(), data: out.data, model: out.model });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    await record({ input: out.inputTokens, output: out.outputTokens, cached: false, ok: true, modelId: out.model });
    return { ok: true, data: out.data as T, model: out.model, cached: false };
  } catch (e) {
    console.error(`InboxPilot AI ${feature} failed`, e);
    await record({ input: 0, output: 0, cached: false, ok: false, modelId: model.id });
    return { ok: false, reason: describeAiError(e) };
  }
}
