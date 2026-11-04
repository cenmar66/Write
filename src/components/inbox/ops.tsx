"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { Skeleton } from "./ui";

interface Ops {
  ai: { last30Days: Record<string, { requests: number; cached: number; failed: number; input: number; output: number; cost: number }>; totalCost: number };
  jobs: { counts: Record<string, number>; recentFailures: { kind: string; status: string; attempts: number; last_error: string; updated_at: string }[] };
  accounts: { id: string; email: string; provider: string; status: string; last_sync_at: string | null; last_error: string | null; sync_state: { phase?: string; fetched?: number } }[];
  estimate: { perMonthUsd: number; perDayUsd: number; assumptions: Record<string, number> };
  cronConfigured: boolean;
}

/** Internal operations dashboard: AI spend, job queue and sync health. */
export function OpsPage() {
  const q = useQuery({ queryKey: ["ops"], queryFn: () => api<Ops>("/ops"), refetchInterval: 30_000 });
  const d = q.data;
  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <h1 className="text-[22px] font-bold tracking-tight">Operations</h1>
        {!d ? (
          <Skeleton rows={6} />
        ) : (
          <>
            {!d.cronConfigured && <p className="ip-chip ip-chip-warn">CRON_SECRET isn&apos;t set: background sync and scheduled briefings won&apos;t run. Use “Sync now” and “Brief me now”.</p>}
            <section className="ip-card overflow-x-auto p-4">
              <h2 className="font-semibold">AI requests (last 30 days) · ${d.ai.totalCost.toFixed(4)}</h2>
              <table className="mt-2 w-full text-[12.5px]">
                <thead className="ip-muted text-left"><tr><th className="py-1">Feature · model</th><th>Requests</th><th>Cached</th><th>Failed</th><th>Tokens in/out</th><th>Cost</th></tr></thead>
                <tbody>
                  {Object.entries(d.ai.last30Days).map(([k, r]) => (
                    <tr key={k} className="border-t ip-line"><td className="py-1">{k}</td><td>{r.requests}</td><td>{r.cached}</td><td>{r.failed}</td><td>{r.input.toLocaleString()} / {r.output.toLocaleString()}</td><td>${r.cost.toFixed(4)}</td></tr>
                  ))}
                  {!Object.keys(d.ai.last30Days).length && <tr><td className="ip-muted py-2" colSpan={6}>No AI requests yet.</td></tr>}
                </tbody>
              </table>
              <p className="ip-muted mt-2 text-[12px]">Estimated cost per active user: ~${d.estimate.perMonthUsd.toFixed(2)}/month, assuming {d.estimate.assumptions.emailsPerDay} emails/day with {Math.round(d.estimate.assumptions.aiClassifiedShare * 100)}% needing AI classification, {d.estimate.assumptions.draftsPerDay} drafts, {d.estimate.assumptions.briefingsPerDay} briefings and {d.estimate.assumptions.chatsPerDay} assistant questions per day. An estimate, not a bill.</p>
            </section>
            <section className="ip-card p-4">
              <h2 className="font-semibold">Background jobs</h2>
              <div className="mt-2 flex flex-wrap gap-2">{Object.entries(d.jobs.counts).map(([k, v]) => <span key={k} className="ip-chip">{k}: {v}</span>)}{!Object.keys(d.jobs.counts).length && <span className="ip-muted text-[13px]">No jobs yet.</span>}</div>
              {d.jobs.recentFailures.map((f, i) => <p key={i} className="mt-1 text-[12px]" style={{ color: "var(--ip-crit)" }}>{f.kind} ({f.status}, {f.attempts} tries): {f.last_error}</p>)}
            </section>
            <section className="ip-card p-4">
              <h2 className="font-semibold">Sync health</h2>
              <ul className="mt-2 space-y-1 text-[13px]">
                {d.accounts.map((a) => (
                  <li key={a.id}>{a.email} ({a.provider}): <span className="ip-chip">{a.status}</span> {a.sync_state?.phase} · {a.sync_state?.fetched ?? 0} fetched · last sync {a.last_sync_at ? new Date(a.last_sync_at).toLocaleString() : "never"} {a.last_error && <span style={{ color: "var(--ip-crit)" }}>· {a.last_error}</span>}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
