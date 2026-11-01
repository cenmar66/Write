"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { BriefingContent, BriefRef } from "@/lib/inbox/briefing";
import { api, useAct, useBriefing } from "./api";
import { useScope } from "./shell";
import { dueLabel, Empty, Skeleton, Spinner, errText, useToast } from "./ui";

export function refHref(r: BriefRef) {
  if (r.type === "message") return `/inbox/mail?view=all&m=${r.id}`;
  if (r.type === "task") return `/inbox/followups?task=${r.id}`;
  return `/inbox/followups?f=${r.id}`;
}

/** One section's items, each with its source links. */
export function BriefItems({ content, section, compact }: { content: BriefingContent; section: BriefingContent["sections"][number]["id"]; compact?: boolean }) {
  const s = content.sections.find((x) => x.id === section);
  if (!s?.items.length) return <p className="ip-muted text-[13px]">Nothing here.</p>;
  return (
    <ul className="space-y-2">
      {s.items.map((i) => {
        const primary = i.refs.find((r) => r.type === "message") ?? i.refs[0];
        const dot = i.importance === "critical" ? "var(--ip-crit)" : i.importance === "high" ? "var(--ip-high)" : section === "summary" ? "var(--ip-accent)" : "var(--ip-muted)";
        return (
          <li key={i.key} className="flex gap-2.5 text-[13.5px]">
            <span className="mt-[7px] h-2 w-2 flex-none rounded-full" style={{ background: dot }} aria-hidden />
            <div className="min-w-0 flex-1">
              {primary ? (
                <Link href={refHref(primary)} className="hover:underline">{i.text}</Link>
              ) : (
                <span>{i.text}</span>
              )}
              {!compact && i.detail && <p className="ip-muted text-[12.5px]">{i.detail}</p>}
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {i.due && <span className="ip-chip">{i.due_explicit ? "Due" : "Due (inferred)"} {dueLabel(i.due)}</span>}
                {i.inferred && section !== "summary" && <span className="ip-chip ip-chip-warn">Inferred</span>}
                {!compact && i.refs.length > 1 && i.refs.slice(1).map((r) => (
                  <Link key={`${r.type}${r.id}`} href={refHref(r)} className="ip-chip ip-chip-info">{r.type}</Link>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function BriefPage() {
  const { ws, boot } = useScope();
  const [id, setId] = useState<string | undefined>();
  const [mode, setMode] = useState<"concise" | "expanded">(boot.prefs.briefing.mode);
  const q = useBriefing(id);
  const toast = useToast();
  const now = useAct((m: "concise" | "expanded") => api<{ briefing: { id: string } }>("/briefings", { method: "POST", json: { ws, mode: m } }), { onSuccess: (r) => setId(r.briefing.id) });
  const b = q.data?.briefing;
  const c = b?.content;
  const run = (m = mode) => now.mutate(m, { onError: (e) => toast({ text: errText(e), tone: "error" }) });

  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Daily Brief</h1>
          <div className="ml-auto flex flex-wrap gap-2">
            <div className="flex rounded-lg border p-0.5 ip-line" role="tablist" aria-label="Detail">
              {(["concise", "expanded"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} className="ip-tab !py-1 text-[12.5px] capitalize" onClick={() => { setMode(m); run(m); }}>{m}</button>
              ))}
            </div>
            <button className="ip-btn ip-btn-primary" onClick={() => run()} disabled={now.isPending}>
              {now.isPending ? <Spinner size={14} /> : <Sparkles size={14} />} Brief me now
            </button>
          </div>
        </div>
        <p className="ip-muted text-[13px]">
          Built from your stored messages, tasks and follow-ups. Every item links to its source; dates that weren&apos;t stated in an email are marked inferred. Scheduled briefings: {[boot.prefs.briefing.morning && `morning ${boot.prefs.briefing.morning}`, boot.prefs.briefing.midday && `midday ${boot.prefs.briefing.midday}`, boot.prefs.briefing.evening && `evening ${boot.prefs.briefing.evening}`].filter(Boolean).join(", ") || "off"} ({boot.prefs.timezone}). <Link href="/inbox/settings#briefing" className="underline">Change</Link>
        </p>

        {q.isLoading ? (
          <Skeleton rows={6} />
        ) : !b || !c ? (
          <div className="ip-card">
            <Empty icon={Sparkles} title="No briefing yet">Press “Brief me now”.</Empty>
          </div>
        ) : (
          <>
            {q.data!.history.length > 1 && (
              <select className="ip-select !w-auto" value={b.id} onChange={(e) => setId(e.target.value)} aria-label="Earlier briefings">
                {q.data!.history.map((h) => (
                  <option key={h.id} value={h.id}>{new Date(h.created_at).toLocaleString("en-US", { timeZone: boot.prefs.timezone })} · {h.slot.replace("_", " ")}</option>
                ))}
              </select>
            )}
            <section className="ip-card p-4">
              <h2 className="mb-2 font-semibold">Executive summary</h2>
              <BriefItems content={c} section="summary" />
              {c.ai_summary?.length ? (
                <div className="mt-3 rounded-xl p-3" style={{ background: "var(--ip-accent-soft)" }}>
                  <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--ip-accent)" }}>
                    <Sparkles size={13} /> AI summary ({b.model}) — each sentence cites its sources
                  </p>
                  {c.ai_summary.map((s, i) => (
                    <p key={i} className="text-[13.5px]">
                      {s.text}{" "}
                      {s.refs.map((r, j) => (
                        <Link key={j} href={refHref(r)} className="ip-chip ip-chip-info mr-1 align-middle" aria-label={`Source ${j + 1}`}>
                          <ExternalLink size={10} /> {j + 1}
                        </Link>
                      ))}
                    </p>
                  ))}
                </div>
              ) : c.ai_note ? (
                <p className="ip-muted mt-2 text-[12px]">AI summary unavailable: {c.ai_note}</p>
              ) : null}
            </section>
            {c.sections.filter((s) => s.id !== "summary").map((s) => (
              <section key={s.id} className="ip-card p-4">
                <h2 className="mb-2 font-semibold">
                  {s.title} <span className="ip-muted font-normal">({s.items.length})</span>
                </h2>
                <BriefItems content={c} section={s.id} compact={mode === "concise"} />
              </section>
            ))}
            <p className="ip-muted text-[12px]">Period: {new Date(c.period.start).toLocaleString("en-US", { timeZone: boot.prefs.timezone })} → {new Date(c.period.end).toLocaleString("en-US", { timeZone: boot.prefs.timezone })}</p>
          </>
        )}
      </div>
    </div>
  );
}
