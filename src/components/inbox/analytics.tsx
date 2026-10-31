"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "./api";
import { useScope } from "./shell";
import { Skeleton } from "./ui";

/** Tiny bar chart (no chart library). `accent` is drawn as the highlighted part of each bar. */
export function Bars({ data, height = 120 }: { data: { label: string; value: number; accent?: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="mt-2 w-full" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 4);
        const a = ((d.accent ?? 0) / max) * (height - 4);
        return (
          <g key={i}>
            <rect x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx={1.2} fill="var(--ip-accent)" opacity={0.28} />
            <rect x={i * w + w * 0.15} y={height - a} width={w * 0.7} height={a} rx={1.2} fill="var(--ip-accent)" />
          </g>
        );
      })}
    </svg>
  );
}

interface Data {
  range: { from: string; to: string };
  measured: Record<string, number | null>;
  agreement_rate: number | null;
  estimated: { time_saved_minutes: number; assumptions: Record<string, number>; note: string };
  daily: { day: string; incoming: number; high: number; low: number; sent: number; unread: number }[];
}

export function AnalyticsPage() {
  const { ws } = useScope();
  const [range, setRange] = useState("7");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ ws, ...(range === "custom" && from && to ? { from, to } : { range: range === "custom" ? "30" : range }) });
  const q = useQuery({ queryKey: ["analytics", qs.toString()], queryFn: () => api<Data>(`/analytics?${qs}`) });
  const d = q.data;
  const M = (k: string) => d?.measured[k] ?? 0;
  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Analytics</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {["1", "7", "30", "90", "custom"].map((r) => (
              <button key={r} role="tab" className="ip-tab" aria-selected={range === r} onClick={() => setRange(r)}>{r === "1" ? "Today" : r === "custom" ? "Custom" : `${r} days`}</button>
            ))}
            {range === "custom" && (
              <>
                <input type="date" className="ip-input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
                <input type="date" className="ip-input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
              </>
            )}
            <a className="ip-btn" href={`/api/inbox/analytics?${qs}&format=csv`}><Download size={14} /> CSV</a>
          </div>
        </div>
        {q.isLoading || !d ? (
          <Skeleton rows={6} />
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card label="Incoming" value={M("incoming")} />
              <Card label="High priority" value={M("high_priority")} />
              <Card label="Low-value" value={M("low_value")} />
              <Card label="Newsletters" value={M("newsletters")} />
              <Card label="Median reply time" value={d.measured.median_response_hours == null ? "—" : `${Number(d.measured.median_response_hours).toFixed(1)} h`} sub={`${M("responses_measured")} replies measured`} />
              <Card label="Outstanding conversations" value={M("outstanding_conversations")} />
              <Card label="Overdue follow-ups" value={M("overdue_followups")} />
              <Card label="Tasks from email" value={M("tasks_from_email")} />
            </section>
            <section className="ip-card p-4">
              <h2 className="font-semibold">Incoming volume per day</h2>
              <p className="ip-muted text-[12px]">Dark: high priority. Light: everything else.</p>
              <Bars data={d.daily.map((x) => ({ label: x.day, value: x.incoming, accent: x.high }))} height={140} />
              <div className="ip-muted mt-1 flex justify-between text-[11px]"><span>{d.daily[0]?.day}</span><span>{d.daily[d.daily.length - 1]?.day}</span></div>
            </section>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="ip-card p-4">
                <h2 className="font-semibold">Classification</h2>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                  <dt className="ip-muted">Messages classified</dt><dd>{M("classified")}</dd>
                  <dt className="ip-muted">Your corrections</dt><dd>{M("corrections")}</dd>
                  <dt className="ip-muted">Kept without correction</dt><dd>{d.agreement_rate == null ? "—" : `${Math.round(d.agreement_rate * 100)}%`}</dd>
                </dl>
                <p className="ip-muted mt-2 text-[11.5px]">Not a true accuracy score: a classification you didn&apos;t correct isn&apos;t necessarily right.</p>
              </section>
              <section className="ip-card p-4">
                <h2 className="font-semibold">AI usage &amp; cost</h2>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                  <dt className="ip-muted">AI requests</dt><dd>{M("ai_requests")}</dd>
                  <dt className="ip-muted">Tokens</dt><dd>{Number(M("ai_tokens")).toLocaleString()}</dd>
                  <dt className="ip-muted">Approx. cost</dt><dd>${Number(M("ai_cost_usd")).toFixed(4)}</dd>
                  <dt className="ip-muted">AI drafts</dt><dd>{M("drafts_created")}</dd>
                </dl>
                <Link href="/inbox/ops" className="mt-2 inline-block text-[12px] underline">Operations dashboard</Link>
              </section>
            </div>
            <section className="ip-card p-4">
              <h2 className="flex items-center gap-1.5 font-semibold"><Info size={15} /> Estimated time saved: ~{d.estimated.time_saved_minutes} minutes</h2>
              <p className="ip-muted mt-1 text-[12.5px]">{d.estimated.note}</p>
              <p className="ip-muted text-[12.5px]">Assumptions: {d.estimated.assumptions.secondsPerLowValueTriaged}s per low-value message, {d.estimated.assumptions.secondsPerBriefingItem}s per important item surfaced, {d.estimated.assumptions.secondsPerDraft}s per AI draft.</p>
            </section>
            <section className="ip-card overflow-x-auto p-4">
              <h2 className="mb-2 font-semibold">Daily detail</h2>
              <table className="w-full text-[12.5px]">
                <thead className="ip-muted text-left"><tr><th className="py-1">Day</th><th>Incoming</th><th>High</th><th>Low-value</th><th>Sent</th><th>Unread</th></tr></thead>
                <tbody>{d.daily.map((x) => <tr key={x.day} className="border-t ip-line"><td className="py-1">{x.day}</td><td>{x.incoming}</td><td>{x.high}</td><td>{x.low}</td><td>{x.sent}</td><td>{x.unread}</td></tr>)}</tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="ip-card p-3.5">
      <p className="ip-muted text-[12px]">{label}</p>
      <p className="text-[22px] font-bold">{value}</p>
      {sub && <p className="ip-muted text-[11px]">{sub}</p>}
    </div>
  );
}
