import { buildReport, safeTimeZone } from "@/lib/satori/costs";
import { currentBudget, satoriContext, serviceFailure } from "@/lib/satori/server";

const RANGES = [7, 30, 90] as const;

/** Money spent: GET ?days=7|30|90&tz=America/Los_Angeles. Estimates from token counts. */
export async function GET(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const p = new URL(request.url).searchParams;
  const days = RANGES.find((d) => String(d) === p.get("days")) ?? 30;
  const timeZone = safeTimeZone(p.get("tz"));
  try {
    const prefs = await ctx.store.getPreferences();
    // Enough history for the range plus the whole current month in any time zone.
    const rows = await ctx.store.usageRows(new Date(Date.now() - (Math.max(days, 32) + 1) * 86_400_000));
    const report = buildReport(rows, { prices: prefs.model_prices, timeZone, rangeDays: days });
    return Response.json({ report, budget: await currentBudget(ctx, prefs) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
