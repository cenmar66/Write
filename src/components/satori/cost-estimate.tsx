"use client";

// "Est. about 2–4¢" next to a Run/Generate button. Asks the server (no AI call), debounced.
import { Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRange, type Estimate, type EstimateRequest } from "@/lib/satori/estimate";
import { api } from "./client";

type Result = { estimates: Estimate[]; total: { lowUsd: number | null; highUsd: number | null } };

export function CostEstimate({ request, targets, labels, className = "" }: { request: EstimateRequest; targets?: { provider: string; model: string }[]; labels?: Record<string, string>; className?: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const key = JSON.stringify({ request, targets });

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      api<Result>("/api/satori/estimate", { body: { ...request, targets: targets ?? [] }, signal: ac.signal })
        .then(setResult)
        .catch(() => {});
    }, 500);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // The serialized key captures every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!result || !result.estimates.length) return null;
  const unknown = result.estimates.some((e) => !e.priced);
  const fromHistory = result.estimates.every((e) => e.basis === "your history");
  const title = `Estimated from ${fromHistory ? "your past runs" : "typical sizes"} and current prices. The final cost depends on how long the answer is.${unknown ? " Some models have no price yet: add one in Settings → Budget & prices." : ""}`;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ps-muted ${className}`} title={title} aria-live="polite" data-testid="cost-estimate">
      <Coins size={13} aria-hidden />
      {result.estimates.length > 1 ? (
        result.estimates.map((e) => (
          <span key={`${e.provider}:${e.model}`}>
            {labels?.[`${e.provider}::${e.model}`] ?? e.model}: {e.priced ? formatRange(e.lowUsd, e.highUsd) : "cost unknown"}
          </span>
        ))
      ) : (
        <span>Est. {unknown ? "cost unknown — set a price in Settings" : formatRange(result.total.lowUsd, result.total.highUsd)}</span>
      )}
    </span>
  );
}
