// Money spent: turns usage rows into totals, a daily series and breakdowns, in the
// person's own time zone. Costs are estimates from provider-reported token counts; rows
// recorded without a price (e.g. a model priced later in Settings) are priced at read time.
import { LIMITS } from "./limits";
import { priceFor, type PriceSource, type UserPrices } from "./pricing";
import type { Preferences, UsageEntry } from "./store/types";

export type CostRow = UsageEntry & { created_at: string };

export type Totals = { requests: number; costUsd: number; unpricedRequests: number; inputTokens: number; outputTokens: number };
export type ModelLine = Totals & { provider: string; model: string; priceSource: PriceSource | null };
export type KindLine = { kind: string; label: string; requests: number; costUsd: number };

export type CostReport = {
  timeZone: string;
  rangeDays: number;
  today: Totals;
  month: Totals;
  range: Totals;
  daily: { date: string; costUsd: number; requests: number }[];
  byModel: ModelLine[];
  byKind: KindLine[];
};

export const KIND_LABELS: Record<string, string> = {
  generate: "Generating prompts",
  clarify: "Clarifying questions",
  refine: "Refining",
  analyze: "Analyzing",
  adapt: "Adapting to another model",
  template: "Making templates",
  compare: "Comparing",
  judge: "AI ratings",
  test: "Testing Lab runs",
};

const empty = (): Totals => ({ requests: 0, costUsd: 0, unpricedRequests: 0, inputTokens: 0, outputTokens: 0 });

/** A valid IANA time zone, or UTC. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** YYYY-MM-DD for an instant in a time zone. */
export function dayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** The cost of one usage row: as recorded, or priced now with your prices. */
export function rowCost(r: UsageEntry, prices: UserPrices): number | null {
  if (r.cost_usd !== null && r.cost_usd !== undefined) return Number(r.cost_usd);
  const found = priceFor(r.provider, r.model, prices);
  if (!found || r.input_tokens === null) return null;
  return ((r.input_tokens ?? 0) * found.price.input + (r.output_tokens ?? 0) * found.price.output) / 1_000_000;
}

function add(t: Totals, r: CostRow, cost: number | null) {
  t.requests++;
  t.inputTokens += r.input_tokens ?? 0;
  t.outputTokens += r.output_tokens ?? 0;
  if (cost === null) t.unpricedRequests++;
  else t.costUsd += cost;
}

/** Spending report for the last `rangeDays` days (plus today and this calendar month). */
export function buildReport(rows: CostRow[], opts: { prices: UserPrices; timeZone: string; rangeDays: number; now?: Date }): CostReport {
  const now = opts.now ?? new Date();
  const tz = safeTimeZone(opts.timeZone);
  const todayKey = dayKey(now, tz);
  const monthKey = todayKey.slice(0, 7);
  const days: string[] = [];
  for (let i = opts.rangeDays - 1; i >= 0; i--) days.push(dayKey(new Date(now.getTime() - i * 86_400_000), tz));
  const inRange = new Set(days);

  const today = empty();
  const month = empty();
  const range = empty();
  const daily = new Map(days.map((d) => [d, { date: d, costUsd: 0, requests: 0 }]));
  const byModel = new Map<string, ModelLine>();
  const byKind = new Map<string, KindLine>();

  for (const r of rows) {
    const key = dayKey(new Date(r.created_at), tz);
    const cost = rowCost(r, opts.prices);
    if (key === todayKey) add(today, r, cost);
    if (key.startsWith(monthKey)) add(month, r, cost);
    if (!inRange.has(key)) continue;
    add(range, r, cost);
    const day = daily.get(key)!;
    day.requests++;
    day.costUsd += cost ?? 0;
    const mk = `${r.provider}:${r.model}`;
    const line = byModel.get(mk) ?? { ...empty(), provider: r.provider, model: r.model, priceSource: priceFor(r.provider, r.model, opts.prices)?.source ?? null };
    add(line, r, cost);
    byModel.set(mk, line);
    const k = byKind.get(r.kind) ?? { kind: r.kind, label: KIND_LABELS[r.kind] ?? r.kind, requests: 0, costUsd: 0 };
    k.requests++;
    k.costUsd += cost ?? 0;
    byKind.set(r.kind, k);
  }

  return {
    timeZone: tz,
    rangeDays: opts.rangeDays,
    today,
    month,
    range,
    daily: [...daily.values()],
    byModel: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests),
    byKind: [...byKind.values()].sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests),
  };
}

export type BudgetStatus = {
  /** The budget in force: the lower of yours and the server's. Null when neither is set. */
  limitUsd: number | null;
  yourBudgetUsd: number | null;
  serverLimitUsd: number | null;
  spentUsd: number;
  percent: number | null;
  alertPercent: number;
  level: "none" | "ok" | "warn" | "over";
};

export function budgetStatus(monthSpent: number, prefs: Pick<Preferences, "monthly_budget_usd" | "alert_percent">, serverLimit = LIMITS.monthlyBudgetUsd): BudgetStatus {
  const yours = prefs.monthly_budget_usd && prefs.monthly_budget_usd > 0 ? prefs.monthly_budget_usd : null;
  const server = serverLimit > 0 ? serverLimit : null;
  const limit = yours !== null && server !== null ? Math.min(yours, server) : (yours ?? server);
  const percent = limit ? Math.round((monthSpent / limit) * 1000) / 10 : null;
  const alert = prefs.alert_percent || 80;
  const level = percent === null ? "none" : percent >= 100 ? "over" : percent >= alert ? "warn" : "ok";
  return { limitUsd: limit, yourBudgetUsd: yours, serverLimitUsd: server, spentUsd: monthSpent, percent, alertPercent: alert, level };
}
