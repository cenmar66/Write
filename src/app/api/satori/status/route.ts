import { LIMITS, startOfMonth } from "@/lib/satori/limits";
import { canSetPrice, priceFor } from "@/lib/satori/pricing";
import { mockEnabled, providerStatus, resolveProvider } from "@/lib/satori/providers";
import { currentBudget, satoriContext, localMode } from "@/lib/satori/server";

/** What's connected (never secrets), current usage, budget and limits. */
export async function GET() {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const prefs = await ctx.store.getPreferences().catch(() => null);
  const active = resolveProvider({ provider: prefs?.provider, model: prefs?.model });
  const usage = await ctx.store.usageSince(startOfMonth()).catch(() => null);
  const budget = prefs ? await currentBudget(ctx, prefs).catch(() => null) : null;
  const providers = providerStatus().map((p) => ({
    ...p,
    // Price per million tokens for each model, and where it comes from (null = unknown).
    models: p.models.map((m) => {
      const found = priceFor(p.id, m.id, prefs?.model_prices ?? {});
      return { ...m, price: found?.price ?? null, priceSource: found?.source ?? null, canSetPrice: canSetPrice(p.id, m.id) };
    }),
  }));
  return Response.json(
    {
      providers,
      active: active ? { provider: active.provider.id, label: active.provider.label, model: active.model, isMock: !!active.provider.isMock } : null,
      localMode: localMode(),
      mock: mockEnabled(),
      store: ctx.store.kind,
      databaseReady: prefs !== null,
      limits: { perMinute: LIMITS.perMinute, perDay: LIMITS.perDay, monthlyBudgetUsd: LIMITS.monthlyBudgetUsd },
      usage,
      budget,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
