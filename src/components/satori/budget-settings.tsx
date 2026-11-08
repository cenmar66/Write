"use client";

// Settings → Budget & prices: your monthly budget, when to warn, and prices for models
// that have no built-in price (so their cost can be counted and estimated).
import Link from "next/link";
import { useState } from "react";
import { BudgetBar, usd } from "./costs";
import { useSatori } from "./provider";
import { Field, Spinner } from "./ui";

const ALERTS = [50, 75, 80, 90, 100];

function sourceLabel(s: string | null | undefined) {
  if (s === "built-in") return "list price";
  if (s === "yours") return "your price";
  if (s === "server") return "server price";
  return "no price yet";
}

export function BudgetSettings() {
  const { prefs, savePrefs, status, reloadStatus, toast } = useSatori();
  // Drafts are null until edited, so they show the saved settings (which load after first render).
  const [budgetDraft, setBudget] = useState<string | null>(null);
  const [priceDrafts, setPrices] = useState<Record<string, { input: string; output: string }> | null>(null);
  const budget = budgetDraft ?? (prefs.monthly_budget_usd === null ? "" : String(prefs.monthly_budget_usd));
  const prices = priceDrafts ?? Object.fromEntries(Object.entries(prefs.model_prices).map(([k, v]) => [k, { input: String(v.input), output: String(v.output) }]));
  const [saving, setSaving] = useState<"budget" | "prices" | null>(null);

  const server = status?.limits.monthlyBudgetUsd || null;
  const models = (status?.providers ?? [])
    .filter((p) => p.configured && !p.isMock)
    .flatMap((p) => p.models.map((m) => ({ ...m, providerLabel: p.label, key: `${p.id}:${m.id}` })));

  async function saveBudget() {
    const value = budget.trim() === "" ? null : Number(budget);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100000)) return toast("Enter a budget in dollars, like 20", "error");
    setSaving("budget");
    try {
      await savePrefs({ monthly_budget_usd: value });
      await reloadStatus();
      setBudget(null);
      toast(value === null ? "Budget removed" : `Monthly budget set to ${usd(value)}`, "ok");
    } finally {
      setSaving(null);
    }
  }

  async function savePrices() {
    const out: Record<string, { input: number; output: number }> = {};
    for (const [k, v] of Object.entries(prices)) {
      if (v.input.trim() === "" && v.output.trim() === "") continue;
      const input = Number(v.input);
      const output = Number(v.output);
      if (v.input.trim() === "" || v.output.trim() === "" || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0)
        return toast(`Check the prices for ${k.split(":").slice(1).join(":")}: both need a number.`, "error");
      out[k] = { input, output };
    }
    setSaving("prices");
    try {
      await savePrefs({ model_prices: out });
      await reloadStatus();
      setPrices(null);
      toast("Prices saved", "ok");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      {status?.budget && <BudgetBar budget={status.budget} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Monthly budget (USD)" hint="AI requests pause once this month's estimated spend reaches it. Leave empty for no budget of your own." htmlFor="ps-budget">
          <input id="ps-budget" className="ps-input" inputMode="decimal" placeholder={server ? String(server) : "e.g. 20"} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <Field label="Warn me at" htmlFor="ps-alert">
          <select id="ps-alert" className="ps-select" value={prefs.alert_percent} onChange={(e) => void savePrefs({ alert_percent: Number(e.target.value) }).then(reloadStatus)}>
            {ALERTS.map((a) => (
              <option key={a} value={a}>
                {a}% used
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="ps-btn ps-btn-primary" onClick={saveBudget} disabled={saving !== null}>
          {saving === "budget" ? <Spinner size={14} label="Saving…" /> : "Save budget"}
        </button>
      </div>
      <p className="text-xs ps-muted">
        {server ? `The server also has a limit of ${usd(server)} a month (SATORI_MONTHLY_BUDGET_USD in Vercel); the lower of the two applies. ` : ""}
        Other limits: {status?.limits.perMinute || "no"} requests a minute, {status?.limits.perDay || "no"} a day. Budgets count the calendar month in UTC and use estimates from token counts; your provider&apos;s bill is the source of truth.{" "}
        <Link className="underline" href="/satori/costs">
          See what you&apos;ve spent
        </Link>
        .
      </p>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Model prices</h3>
        <p className="text-xs ps-muted">
          USD per million tokens. Claude&apos;s list prices are built in. For other models, copy the input and output prices from the provider&apos;s pricing page so their costs are counted and estimated (past requests too).
        </p>
        {models.length === 0 ? (
          <p className="text-sm ps-muted">No AI providers are connected.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="model-prices">
              <thead>
                <tr className="text-xs ps-muted">
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium">Input $/M</th>
                  <th className="pb-2 font-medium">Output $/M</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.key} className="border-t ps-line">
                    <td className="py-2 pr-2">
                      <span className="block">{m.label}</span>
                      <span className="text-xs ps-muted">
                        {m.providerLabel} · {sourceLabel(m.priceSource)}
                      </span>
                    </td>
                    {m.canSetPrice ? (
                      (["input", "output"] as const).map((side) => (
                        <td key={side} className="py-2 pr-2">
                          <input
                            className="ps-input w-24 py-1.5 text-sm"
                            inputMode="decimal"
                            aria-label={`${m.label} ${side} price per million tokens`}
                            placeholder={m.price ? String(m.price[side]) : "—"}
                            value={prices[m.key]?.[side] ?? ""}
                            onChange={(e) => setPrices({ ...prices, [m.key]: { input: prices[m.key]?.input ?? "", output: prices[m.key]?.output ?? "", [side]: e.target.value } })}
                          />
                        </td>
                      ))
                    ) : (
                      <>
                        <td className="py-2 tabular-nums ps-soft">{m.price ? usd(m.price.input) : "—"}</td>
                        <td className="py-2 tabular-nums ps-soft">{m.price ? usd(m.price.output) : "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {models.some((m) => m.canSetPrice) && (
          <button type="button" className="ps-btn" onClick={savePrices} disabled={saving !== null}>
            {saving === "prices" ? <Spinner size={14} label="Saving…" /> : "Save prices"}
          </button>
        )}
      </div>
    </div>
  );
}
