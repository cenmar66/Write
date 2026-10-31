import { LIMITS, startOfMonth } from "@/lib/dojo/limits";
import { mockEnabled, providerStatus, resolveProvider } from "@/lib/dojo/providers";
import { dojoContext, localMode } from "@/lib/dojo/server";

/** What's connected (never secrets), current usage and limits. */
export async function GET() {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const prefs = await ctx.store.getPreferences().catch(() => null);
  const active = resolveProvider({ provider: prefs?.provider, model: prefs?.model });
  const usage = await ctx.store.usageSince(startOfMonth()).catch(() => null);
  return Response.json(
    {
      providers: providerStatus(),
      active: active ? { provider: active.provider.id, label: active.provider.label, model: active.model, isMock: !!active.provider.isMock } : null,
      localMode: localMode(),
      mock: mockEnabled(),
      store: ctx.store.kind,
      databaseReady: prefs !== null,
      limits: { perMinute: LIMITS.perMinute, perDay: LIMITS.perDay, monthlyBudgetUsd: LIMITS.monthlyBudgetUsd },
      usage,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
