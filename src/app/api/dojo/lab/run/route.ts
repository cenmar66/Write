import { LabRunBody } from "@/lib/dojo/api-schemas";
import { getProvider } from "@/lib/dojo/providers";
import { checkLimits, dojoContext, readBody, recordUsage } from "@/lib/dojo/server";
import { runPrompt, ServiceError } from "@/lib/dojo/services";

export const maxDuration = 300;

/**
 * Runs a prompt against up to three connected models side by side. Each result reports
 * the provider and the model that actually answered. Results are returned, not saved;
 * the client saves the ones the person wants to keep.
 */
export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, LabRunBody);
  if ("denied" in body) return body.denied;
  const limited = await checkLimits(ctx, "ai");
  if (limited) return limited;

  const results = await Promise.all(
    body.data.targets.map(async (t) => {
      const provider = getProvider(t.provider);
      if (!provider || !provider.models().some((m) => m.id === t.model)) {
        return { ok: false as const, provider: t.provider, model: t.model, error: "That provider or model isn't connected." };
      }
      try {
        const r = await runPrompt({ provider, model: t.model }, { prompt: body.data.prompt, variables: body.data.variables });
        await recordUsage(ctx, [{ kind: "test", provider: r.provider, requestedModel: r.requestedModel, model: r.model, inputTokens: r.usage?.inputTokens ?? null, outputTokens: r.usage?.outputTokens ?? null, costUsd: r.costUsd }]);
        return { ok: true as const, ...r };
      } catch (error) {
        if (error instanceof ServiceError) await recordUsage(ctx, error.usage);
        return { ok: false as const, provider: t.provider, model: t.model, error: error instanceof Error ? error.message : "Run failed." };
      }
    }),
  );
  return Response.json({ results });
}
