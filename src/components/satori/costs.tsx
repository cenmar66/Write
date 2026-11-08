"use client";

import { AlertTriangle, CheckCircle2, OctagonAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BudgetStatus, CostReport, Totals } from "@/lib/satori/costs";
import { api, formatCost } from "./client";
import { useSatori } from "./provider";
import { ErrorBox, Notice, PageHeader } from "./ui";

const RANGES = [7, 30, 90] as const;

export function usd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  if (v === 0) return "$0.00";
  if (v < 0.01) return "<$0.01";
  return `$${v.toFixed(2)}`;
}

function Tile({ label, totals, sub }: { label: string; totals: Totals; sub?: string }) {
  return (
    <div className="ps-card p-4">
      <p className="text-xs ps-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{usd(totals.costUsd)}</p>
      <p className="mt-0.5 text-xs ps-muted">
        {totals.requests.toLocaleString()} AI request{totals.requests === 1 ? "" : "s"}
        {totals.unpricedRequests ? ` · ${totals.unpricedRequests} without a price` : ""}
        {sub ? ` · ${sub}` : ""}
      </p>
    </div>
  );
}

export function BudgetBar({ budget, compact }: { budget: BudgetStatus; compact?: boolean }) {
  if (budget.limitUsd === null) return compact ? null : <p className="text-sm ps-muted">No monthly budget set.</p>;
  const pct = Math.min(100, budget.percent ?? 0);
  const color = budget.level === "over" ? "var(--ps-danger)" : budget.level === "warn" ? "var(--ps-warn)" : "var(--ps-chart)";
  const Icon = budget.level === "over" ? OctagonAlert : budget.level === "warn" ? AlertTriangle : CheckCircle2;
  const state = budget.level === "over" ? "Budget used up" : budget.level === "warn" ? `Over ${budget.alertPercent}% used` : "Within budget";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="tabular-nums">
          <strong>{usd(budget.spentUsd)}</strong> of {usd(budget.limitUsd)}
        </span>
        {!compact && (
          <span className="flex items-center gap-1 text-xs" style={{ color: budget.level === "ok" ? "var(--ps-ink-3)" : color }}>
            <Icon size={13} aria-hidden /> {state}
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full ps-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`Monthly budget used: ${Math.round(budget.percent ?? 0)}%`}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Daily spend: one series, one y-axis, hover tooltip per bar, table view for screen readers. */
function DailyChart({ daily }: { daily: CostReport["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...daily.map((d) => d.costUsd), 0);
  const top = niceMax(max);
  const W = 720;
  const H = 200;
  const pad = { l: 44, r: 8, t: 10, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const step = iw / daily.length;
  const gap = 2;
  const bw = Math.max(1, step - gap);
  const y = (v: number) => pad.t + ih - (top ? (v / top) * ih : 0);
  const ticks = [0, top / 2, top];
  const labelEvery = daily.length <= 7 ? 1 : daily.length <= 30 ? 5 : 15;
  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Daily estimated spend, last ${daily.length} days, highest ${usd(max)}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--ps-line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ps-ink-3)">
              {t === 0 ? "$0" : t < 0.1 ? `${+(t * 100).toFixed(2)}¢` : `$${t.toFixed(Number.isInteger(t) ? 0 : 2)}`}
            </text>
          </g>
        ))}
        {daily.map((d, i) => {
          const x = pad.l + i * step + gap / 2;
          const h = Math.max(0, pad.t + ih - y(d.costUsd));
          const r = Math.min(4, bw / 2, h);
          const bx = x;
          const by = pad.t + ih - h;
          return (
            <g key={d.date}>
              {h > 0 && (
                <path
                  d={`M${bx},${by + h} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${by + h} Z`}
                  fill="var(--ps-chart)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {/* Hit target: the whole column, bigger than the bar. */}
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--ps-ink-3)">
                  {fmtDay(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="ps-card pointer-events-none absolute z-10 -translate-x-1/2 px-3 py-2 text-xs shadow-lg"
          style={{ left: `${((pad.l + hover * step + step / 2) / W) * 100}%`, top: 0 }}
          role="status"
        >
          <p className="font-semibold">{fmtDay(daily[hover].date)}</p>
          <p className="tabular-nums">{usd(daily[hover].costUsd)} · {daily[hover].requests} request{daily[hover].requests === 1 ? "" : "s"}</p>
        </div>
      )}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer ps-muted">Show as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="ps-muted">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">Requests</th>
              <th className="py-1 text-right font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.date} className="border-t ps-line">
                <td className="py-1">{fmtDay(d.date)}</td>
                <td className="py-1">{d.requests}</td>
                <td className="py-1 text-right">{usd(d.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** A round axis top: 1, 2, 2.5 or 5 × 10^n above the max. */
function niceMax(v: number): number {
  if (v <= 0) return 0.02;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const SOURCE_LABEL = { "built-in": "list price", server: "server price", yours: "your price" } as const;

export function CostsPage() {
  const { status } = useSatori();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<{ report: CostReport; budget: BudgetStatus } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/satori/costs?days=${days}&tz=${encodeURIComponent(tz)}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [days, tz]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set after the request resolves
    void load();
  }, [load]);

  const r = data?.report;
  const unpricedModels = r?.byModel.filter((m) => m.unpricedRequests > 0) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Costs"
        subtitle="What PromptSatori's AI requests have cost, estimated from the token counts each provider reports. Your providers' bills are the final word."
        actions={
          <div className="flex gap-1" role="tablist" aria-label="Period">
            {RANGES.map((d) => (
              <button key={d} type="button" role="tab" aria-selected={days === d} className="ps-chip" onClick={() => setDays(d)}>
                {d} days
              </button>
            ))}
          </div>
        }
      />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!r ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ps-skeleton h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="Today" totals={r.today} />
            <Tile label="This month" totals={r.month} />
            <Tile label={`Last ${r.rangeDays} days`} totals={r.range} />
          </div>

          <section className="ps-card space-y-3 p-4 sm:p-5" aria-labelledby="ps-budget-h">
            <div className="flex flex-wrap items-center gap-2">
              <Wallet size={17} className="ps-muted" aria-hidden />
              <h2 id="ps-budget-h" className="flex-1 font-semibold">
                Monthly budget
              </h2>
              <Link href="/satori/settings#budget" className="ps-btn ps-btn-sm">
                Change budget
              </Link>
            </div>
            {data && <BudgetBar budget={data.budget} />}
            <p className="text-xs ps-muted">
              Budgets count the calendar month in UTC.
              {data?.budget.serverLimitUsd !== null && data?.budget.yourBudgetUsd !== null && data!.budget.serverLimitUsd! < data!.budget.yourBudgetUsd!
                ? ` The server limit (${usd(data!.budget.serverLimitUsd)}, SATORI_MONTHLY_BUDGET_USD in Vercel) is lower than yours, so it applies.`
                : ""}{" "}
              When the budget is used up, AI requests pause until next month or until you raise it.
            </p>
          </section>

          <section className="ps-card space-y-3 p-4 sm:p-5" aria-labelledby="ps-daily-h">
            <h2 id="ps-daily-h" className="font-semibold">
              Daily spend <span className="text-sm font-normal ps-muted">· {r.timeZone}</span>
            </h2>
            {r.range.requests === 0 ? <p className="text-sm ps-muted">No AI requests in this period yet.</p> : <DailyChart daily={r.daily} />}
          </section>

          {unpricedModels.length > 0 && (
            <Notice tone="warn" icon={<AlertTriangle size={16} />}>
              {unpricedModels.map((m) => m.model).join(", ")} {unpricedModels.length === 1 ? "has" : "have"} no price yet, so {r.range.unpricedRequests} request{r.range.unpricedRequests === 1 ? " isn't" : "s aren't"} counted.{" "}
              <Link className="font-semibold underline" href="/satori/settings#budget">
                Add prices in Settings
              </Link>{" "}
              and they&apos;ll be counted from then on, including past requests.
            </Notice>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="ps-card overflow-x-auto p-4 sm:p-5" aria-labelledby="ps-models-h">
              <h2 id="ps-models-h" className="mb-3 font-semibold">
                By AI model
              </h2>
              {r.byModel.length === 0 ? (
                <p className="text-sm ps-muted">Nothing yet.</p>
              ) : (
                <table className="w-full text-left text-sm tabular-nums">
                  <thead>
                    <tr className="text-xs ps-muted">
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium">Requests</th>
                      <th className="pb-2 font-medium">Tokens in / out</th>
                      <th className="pb-2 text-right font-medium">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byModel.map((m) => {
                      const label = status?.providers.find((p) => p.id === m.provider)?.models.find((x) => x.id === m.model)?.label ?? m.model;
                      return (
                        <tr key={`${m.provider}:${m.model}`} className="border-t ps-line">
                          <td className="py-2">
                            <span className="block">{label}</span>
                            <span className="text-xs ps-muted">{m.priceSource ? SOURCE_LABEL[m.priceSource] : "no price"}</span>
                          </td>
                          <td className="py-2">{m.requests}</td>
                          <td className="py-2 text-xs">
                            {m.inputTokens.toLocaleString()} / {m.outputTokens.toLocaleString()}
                          </td>
                          <td className="py-2 text-right">{m.unpricedRequests === m.requests ? "n/a" : usd(m.costUsd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <section className="ps-card overflow-x-auto p-4 sm:p-5" aria-labelledby="ps-kinds-h">
              <h2 id="ps-kinds-h" className="mb-3 font-semibold">
                By activity
              </h2>
              {r.byKind.length === 0 ? (
                <p className="text-sm ps-muted">Nothing yet.</p>
              ) : (
                <table className="w-full text-left text-sm tabular-nums">
                  <thead>
                    <tr className="text-xs ps-muted">
                      <th className="pb-2 font-medium">Activity</th>
                      <th className="pb-2 font-medium">Requests</th>
                      <th className="pb-2 text-right font-medium">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byKind.map((k) => (
                      <tr key={k.kind} className="border-t ps-line">
                        <td className="py-2">{k.label}</td>
                        <td className="py-2">{k.requests}</td>
                        <td className="py-2 text-right">{usd(k.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
          <p className="text-xs ps-muted">
            Estimates use each provider&apos;s list price per token and ignore caching discounts, taxes and free tiers. Claude web searches are counted at 1¢ each. Per-request costs also appear on each result ({formatCost(0.004)} means under a cent).
          </p>
        </>
      )}
    </div>
  );
}
