import { z } from "zod";
import { MAX_CONNECTORS_PER_RUN, MAX_IMAGES } from "@/lib/satori/context";
import { ESTIMATE_KINDS, estimateFor } from "@/lib/satori/estimate";
import { rateLimit } from "@/lib/satori/limits";
import { analyzePrompt, clarifyPrompt, generatePrompt, refinePrompt } from "@/lib/satori/meta-prompts";
import { resolveProvider } from "@/lib/satori/providers";
import { jsonError, readBody, satoriContext, serviceFailure } from "@/lib/satori/server";

const Body = z.object({
  kind: z.enum(ESTIMATE_KINDS),
  chars: z.number().int().min(0).max(5_000_000),
  images: z.number().int().min(0).max(MAX_IMAGES).default(0),
  sourceChars: z.number().int().min(0).max(200_000).default(0),
  clarify: z.boolean().default(false),
  webSearch: z.boolean().default(false),
  connectors: z.number().int().min(0).max(MAX_CONNECTORS_PER_RUN).default(0),
  /** Testing Lab models; other kinds use your generation model. */
  targets: z.array(z.object({ provider: z.string().max(20), model: z.string().max(100) })).max(3).default([]),
});

// PromptSatori's own instructions sent with each kind of request (plus target/profile notes).
const tokens = (s: string) => Math.ceil(s.length / 3.5) + 400;
const OVERHEAD = { generate: tokens(generatePrompt.system), refine: tokens(refinePrompt.system), analyze: tokens(analyzePrompt.system), test: 0 } as const;
const CLARIFY_OVERHEAD = tokens(clarifyPrompt.system);

/** Estimated cost before running something. No AI call is made. */
export async function POST(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, Body);
  if ("denied" in body) return body.denied;
  if (rateLimit(`${ctx.userId}:estimate`, 120)) return jsonError("Too many estimates — try again shortly.", 429, { retryable: true });
  const b = body.data;
  try {
    const prefs = await ctx.store.getPreferences();
    const targets = b.targets.length
      ? b.targets
      : (() => {
          const c = resolveProvider({ provider: prefs.provider, model: prefs.model });
          return c ? [{ provider: c.provider.id, model: c.model }] : [];
        })();
    const history = await ctx.store.usageRows(new Date(Date.now() - 90 * 86_400_000));
    const estimates = targets.map((t) => estimateFor(b, t, { prices: prefs.model_prices, history, overheadTokens: OVERHEAD[b.kind], clarifyOverheadTokens: CLARIFY_OVERHEAD }));
    const low = estimates.every((e) => e.lowUsd !== null) ? estimates.reduce((s, e) => s + (e.lowUsd ?? 0), 0) : null;
    const high = estimates.every((e) => e.highUsd !== null) ? estimates.reduce((s, e) => s + (e.highUsd ?? 0), 0) : null;
    return Response.json({ estimates, total: { lowUsd: low, highUsd: high } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
