import { LabRunBody } from "@/lib/satori/api-schemas";
import { MAX_BODY_WITH_IMAGES, type RunConnector } from "@/lib/satori/context";
import { getProvider } from "@/lib/satori/providers";
import { checkLimits, jsonError, satoriContext, readBody, recordUsage } from "@/lib/satori/server";
import { decrypt } from "@/lib/crypto";
import { runPrompt, ServiceError } from "@/lib/satori/services";

export const maxDuration = 300;

/**
 * Runs a prompt against up to three connected models side by side. Each result reports
 * the provider and the model that actually answered, and what it did with web search or
 * connected apps (Claude only). Results are returned, not saved; the client saves the ones
 * the person wants to keep.
 */
export async function POST(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, LabRunBody, MAX_BODY_WITH_IMAGES);
  if ("denied" in body) return body.denied;
  const b = body.data;
  const limited = await checkLimits(ctx, "ai");
  if (limited) return limited;

  // Connected apps: only the caller's own, enabled ones; tokens decrypted here, never sent back.
  let connectors: RunConnector[] = [];
  if (b.connectorIds.length) {
    const rows = (await ctx.store.getConnectorSecrets(b.connectorIds)).filter((c) => c.enabled);
    if (rows.length !== b.connectorIds.length) return jsonError("One of those connected apps is missing or turned off. Check Settings → Connected apps.", 400);
    try {
      connectors = rows.map((c) => ({ name: c.server_name, url: c.url, ...(c.token_encrypted ? { token: decrypt(c.token_encrypted) } : {}) }));
    } catch {
      return jsonError("A connected app's saved token can't be read. Re-enter it in Settings → Connected apps.", 400);
    }
  }
  const tools = { webSearch: b.webSearch, connectors };

  const results = await Promise.all(
    b.targets.map(async (t) => {
      const provider = getProvider(t.provider);
      if (!provider || !provider.models().some((m) => m.id === t.model)) {
        return { ok: false as const, provider: t.provider, model: t.model, error: "That provider or model isn't connected." };
      }
      try {
        const r = await runPrompt({ provider, model: t.model }, { prompt: b.prompt, variables: b.variables, images: b.images, sources: b.sources, tools });
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
