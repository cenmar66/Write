import { describe, expect, it } from "vitest";
import { budgetStatus, buildReport, rowCost, safeTimeZone, type CostRow } from "@/lib/satori/costs";
import { estimateFor, formatRange, outputRange, TYPICAL_OUTPUT } from "@/lib/satori/estimate";
import { canSetPrice, estimateCost, priceFor } from "@/lib/satori/pricing";

const row = (over: Partial<CostRow>): CostRow => ({
  kind: "generate",
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  input_tokens: 1000,
  output_tokens: 1000,
  cost_usd: 0.012,
  created_at: "2026-11-08T12:00:00Z",
  ...over,
});

describe("pricing with your own prices", () => {
  it("uses built-in Claude prices and ignores attempts to override them", () => {
    expect(priceFor("anthropic", "claude-sonnet-5-5", { "anthropic:claude-sonnet-5-5": { input: 99, output: 99 } })).toEqual({ price: { input: 2, output: 10 }, source: "built-in" });
    expect(canSetPrice("anthropic", "claude-sonnet-5-5")).toBe(false);
  });
  it("prices other models from your settings", () => {
    const prices = { "openai:gpt-test": { input: 1, output: 4 } };
    expect(priceFor("openai", "gpt-test")).toBeNull();
    expect(priceFor("openai", "gpt-test", prices)?.source).toBe("yours");
    expect(canSetPrice("openai", "gpt-test")).toBe(true);
    expect(estimateCost("openai", "gpt-test", { inputTokens: 1_000_000, outputTokens: 500_000 }, prices)).toBeCloseTo(3);
  });
});

describe("cost report", () => {
  const now = new Date("2026-11-08T12:00:00Z");

  it("prices unpriced rows at read time with your prices", () => {
    const r = row({ provider: "openai", model: "gpt-test", cost_usd: null, input_tokens: 2_000_000, output_tokens: 0 });
    expect(rowCost(r, {})).toBeNull();
    expect(rowCost(r, { "openai:gpt-test": { input: 0.5, output: 2 } })).toBeCloseTo(1);
  });

  it("totals today, this month and the range, zero-filling days", () => {
    const rows = [
      row({ created_at: "2026-11-08T09:00:00Z", cost_usd: 0.1 }),
      row({ created_at: "2026-11-06T09:00:00Z", cost_usd: 0.2, kind: "test" }),
      row({ created_at: "2026-10-30T09:00:00Z", cost_usd: 0.4 }),
      row({ created_at: "2026-11-07T09:00:00Z", provider: "openai", model: "gpt-test", cost_usd: null }),
    ];
    const r = buildReport(rows, { prices: {}, timeZone: "UTC", rangeDays: 7, now });
    expect(r.daily).toHaveLength(7);
    expect(r.daily.at(-1)).toMatchObject({ date: "2026-11-08", costUsd: 0.1, requests: 1 });
    expect(r.today.costUsd).toBeCloseTo(0.1);
    expect(r.month.costUsd).toBeCloseTo(0.3);
    expect(r.month.unpricedRequests).toBe(1);
    expect(r.range.requests).toBe(3);
    expect(r.byModel[0]).toMatchObject({ model: "claude-sonnet-5-5", priceSource: "built-in" });
    expect(r.byModel.find((m) => m.model === "gpt-test")?.priceSource).toBeNull();
    expect(r.byKind.map((k) => k.label)).toEqual(["Testing Lab runs", "Generating prompts"]);
  });

  it("buckets days in the person's time zone", () => {
    // 03:00 UTC on the 8th is still the 7th in Los Angeles.
    const rows = [row({ created_at: "2026-11-08T03:00:00Z", cost_usd: 1 })];
    const la = buildReport(rows, { prices: {}, timeZone: "America/Los_Angeles", rangeDays: 7, now });
    expect(la.today.requests).toBe(0);
    expect(la.daily.find((d) => d.date === "2026-11-07")?.costUsd).toBe(1);
    expect(safeTimeZone("Not/AZone")).toBe("UTC");
  });
});

describe("budget", () => {
  it("is none without any budget", () => {
    expect(budgetStatus(5, { monthly_budget_usd: null, alert_percent: 80 }, 0)).toMatchObject({ limitUsd: null, level: "none" });
  });
  it("warns at your alert level and stops at 100%", () => {
    expect(budgetStatus(7, { monthly_budget_usd: 10, alert_percent: 80 }, 0).level).toBe("ok");
    expect(budgetStatus(8, { monthly_budget_usd: 10, alert_percent: 80 }, 0).level).toBe("warn");
    expect(budgetStatus(10, { monthly_budget_usd: 10, alert_percent: 80 }, 0)).toMatchObject({ level: "over", percent: 100 });
  });
  it("uses the lower of your budget and the server limit", () => {
    expect(budgetStatus(1, { monthly_budget_usd: 50, alert_percent: 80 }, 20)).toMatchObject({ limitUsd: 20, yourBudgetUsd: 50, serverLimitUsd: 20 });
    expect(budgetStatus(1, { monthly_budget_usd: 5, alert_percent: 80 }, 20).limitUsd).toBe(5);
  });
});

describe("estimates", () => {
  const sonnet = { provider: "anthropic", model: "claude-sonnet-5-5" };
  const base = { prices: {}, history: [], overheadTokens: 2000 };

  it("gives a typical range before there's history", () => {
    const e = estimateFor({ kind: "generate", chars: 350 }, sonnet, base);
    expect(e.basis).toBe("typical");
    expect(e.priced).toBe(true);
    // 2100 input tokens, 3000–9000 output at $2/$10 per million.
    expect(e.lowUsd).toBeCloseTo((2100 * 2 + 3000 * 10) / 1e6);
    expect(e.highUsd!).toBeGreaterThan(e.lowUsd!);
  });

  it("learns the output range from at least three past runs", () => {
    const history = [1000, 1200, 1400].map((o) => row({ output_tokens: o }));
    expect(outputRange("generate", "anthropic", "claude-sonnet-5-5", history.slice(0, 2)).range).toEqual(TYPICAL_OUTPUT.generate);
    const r = outputRange("generate", "anthropic", "claude-sonnet-5-5", history);
    expect(r.fromHistory).toBe(true);
    expect(r.range[0]).toBeGreaterThanOrEqual(1000);
    expect(r.range[1]).toBeLessThan(2000);
  });

  it("adds clarifying questions, images, and Testing Lab tools", () => {
    const plain = estimateFor({ kind: "generate", chars: 350 }, sonnet, base);
    expect(estimateFor({ kind: "generate", chars: 350, clarify: true }, sonnet, base).highUsd!).toBeGreaterThan(plain.highUsd!);
    expect(estimateFor({ kind: "generate", chars: 350, images: 2 }, sonnet, base).lowUsd!).toBeGreaterThan(plain.lowUsd!);
    const lab = estimateFor({ kind: "test", chars: 350 }, sonnet, { ...base, overheadTokens: 0 });
    const searching = estimateFor({ kind: "test", chars: 350, webSearch: true }, sonnet, { ...base, overheadTokens: 0 });
    expect(searching.highUsd! - lab.highUsd!).toBeGreaterThanOrEqual(0.05);
    // Tools only run on Claude.
    const openai = { provider: "openai", model: "gpt-test" };
    const prices = { "openai:gpt-test": { input: 1, output: 4 } };
    expect(estimateFor({ kind: "test", chars: 350, webSearch: true }, openai, { ...base, prices }).highUsd).toEqual(estimateFor({ kind: "test", chars: 350 }, openai, { ...base, prices }).highUsd);
  });

  it("says when a model has no price", () => {
    const e = estimateFor({ kind: "analyze", chars: 500 }, { provider: "gemini", model: "gem-test" }, base);
    expect(e).toMatchObject({ priced: false, lowUsd: null });
    expect(formatRange(e.lowUsd, e.highUsd)).toBe("cost unknown");
  });

  it("formats ranges for people", () => {
    expect(formatRange(0.001, 0.004)).toBe("under 1¢");
    expect(formatRange(0.02, 0.04)).toBe("about 2–4¢");
    expect(formatRange(0.12, 1.5)).toBe("about 12¢–$1.50");
    expect(formatRange(0.03, 0.031)).toBe("about 3¢");
  });
});

describe("budget enforcement", () => {
  it("refuses paid AI calls once this month's budget is used up", async () => {
    const { checkLimits } = await import("@/lib/satori/server");
    const { memoryStore, resetMemoryStore } = await import("@/lib/satori/store");
    resetMemoryStore();
    const store = memoryStore("budget-user");
    const ctx = { store, userId: "budget-user" };
    await store.savePreferences({ monthly_budget_usd: 1, alert_percent: 80 });
    expect(await checkLimits(ctx, "test")).toBeNull();
    await store.recordUsage([{ kind: "generate", provider: "anthropic", model: "claude-sonnet-5-5", input_tokens: 1, output_tokens: 1, cost_usd: 1.2 }]);
    const res = await checkLimits(ctx, "test");
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body.code).toBe("budget");
    expect(body.error).toMatch(/Settings → Budget & prices/);
  });
});
