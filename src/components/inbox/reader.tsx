"use client";

import { AlarmClock, Check, CheckSquare, Clock, ExternalLink, FileText, Paperclip, Reply, ShieldAlert, Sparkles, Star, UserX, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ACTIONS, IMPORTANCE, MSG_TYPES } from "@/lib/inbox/types";
import { api, useAct, useMessage, type MessageDetail } from "./api";
import { Composer } from "./composer";
import { useScope } from "./shell";
import { FollowupDialog, TaskDialog } from "./task-dialog";
import { Avatar, CategoryChip, dueLabel, ImportanceChip, Skeleton, Spinner, errText, timeLabel, useToast } from "./ui";

const label = (s: string) => s.replace(/_/g, " ");

export function MessageReader({ id, onDone }: { id: string; onDone: () => void }) {
  const q = useMessage(id);
  const { boot } = useScope();
  const toast = useToast();
  const params = useSearchParams();
  const [composer, setComposer] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(params.get("task") === "1");
  const [fuOpen, setFuOpen] = useState(false);
  const patch = useAct((b: Record<string, unknown>) => api(`/messages/${id}`, { method: "PATCH", json: b }));
  const bulk = useAct((b: Record<string, unknown>) => api(`/messages`, { method: "POST", json: { ids: [id], ...b } }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) || e.metaKey || e.ctrlKey || document.querySelector("dialog[open]")) return;
      if (e.key === "r") setComposer("reply");
      if (e.key === "t") setTaskOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Opening a message marks it read inside InboxPilot (and in Gmail only if allowed).
  useEffect(() => {
    if (q.data?.message.is_unread) patch.mutate({ read: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.message.id]);

  if (q.isLoading) return <Skeleton rows={8} />;
  if (q.error || !q.data) return <p className="p-6" style={{ color: "var(--ip-crit)" }}>{q.error?.message ?? "Not found."}</p>;
  const d = q.data;
  const m = d.message;
  const tz = boot.prefs.timezone;
  const external = m.from_email.split("@")[1] !== d.account.email.split("@")[1];
  const suspicious = m.signals?.suspicious ?? [];
  const done = () =>
    bulk.mutate({ action: "done" }, {
      onSuccess: () => {
        toast({ text: "Marked done.", tone: "ok", action: { label: "Undo", run: () => bulk.mutate({ action: "undone" }) } });
        onDone();
      },
    });
  const snooze = (value: string) => bulk.mutate({ action: "snooze", value }, { onSuccess: () => { toast({ text: "Snoozed.", tone: "ok" }); onDone(); }, onError: (e) => toast({ text: errText(e), tone: "error" }) });

  return (
    <div className="ip-scroll flex-1">
      <div className="mx-auto grid max-w-[1200px] gap-5 p-4 md:p-6 xl:grid-cols-[1fr_340px]">
        <article className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="ip-btn ip-btn-sm" onClick={() => setComposer("reply")}><Reply size={13} /> Reply</button>
            <button className="ip-btn ip-btn-sm" onClick={done}><Check size={13} /> Done</button>
            <select className="ip-select !h-7 !w-auto text-[12px]" value="" onChange={(e) => e.target.value && snooze(e.target.value)} aria-label="Snooze">
              <option value="">Snooze…</option>
              <option value="later_today">Later today</option>
              <option value="tomorrow">Tomorrow morning</option>
              <option value="weekend">This weekend</option>
              <option value="next_week">Next week</option>
            </select>
            <button className="ip-btn ip-btn-sm" onClick={() => patch.mutate({ snooze: "until_reply", snooze_until_reply: true }, { onSuccess: () => { toast({ text: "Hidden until someone replies (max 30 days).", tone: "ok" }); onDone(); } })} title="Hide until a reply arrives in this conversation">
              <AlarmClock size={13} /> Until reply
            </button>
            <select className="ip-select !h-7 !w-auto text-[12px]" value={m.category ?? ""} onChange={(e) => patch.mutate({ correct: { field: "category", value: e.target.value } }, { onSuccess: () => toast({ text: "Moved. InboxPilot will remember this for similar mail.", tone: "ok" }) })} aria-label="Category">
              {[...new Map(boot.categories.filter((c) => c.workspace_id === m.workspace_id && !c.hidden).map((c) => [c.key, c])).values()].map((c) => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
            </select>
            {d.webLink && (
              <a href={d.webLink} target="_blank" rel="noopener noreferrer" className="ip-btn ip-btn-sm ml-auto">
                <ExternalLink size={13} /> Open in Gmail
              </a>
            )}
          </div>

          <div>
            <h1 className="text-[20px] font-bold leading-snug tracking-tight">{m.subject || "(no subject)"}</h1>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <ImportanceChip value={m.importance} />
              {external && <span className="ip-chip ip-chip-warn">External</span>}
              {m.vip && <span className="ip-chip ip-chip-info"><Star size={10} fill="currentColor" /> VIP</span>}
              <CategoryChip k={m.category} name={boot.categories.find((c) => c.key === m.category)?.name} />
              <span className="ip-chip">{d.account.email}</span>
            </div>
          </div>

          {suspicious.length > 0 && (
            <div className="rounded-xl border p-3 text-[13px]" style={{ borderColor: "var(--ip-crit)", background: "var(--ip-crit-soft)", color: "var(--ip-crit)" }} role="alert">
              <p className="flex items-center gap-1.5 font-semibold"><ShieldAlert size={15} /> Be careful with this message</p>
              <ul className="mt-1 list-disc pl-5">{suspicious.map((s) => <li key={s}>{s}</li>)}</ul>
              <p className="mt-1">Don&apos;t click links or share information unless you&apos;ve verified the sender another way.</p>
            </div>
          )}
          {m.c?.injection_flag && (
            <div className="rounded-xl border p-3 text-[13px] ip-line" style={{ background: "var(--ip-warn-soft)", color: "var(--ip-warn)" }} role="note">
              This message contains text that tries to give instructions to AI tools. InboxPilot treats email content as plain data: it can&apos;t make the AI send, forward or delete anything.
            </div>
          )}

          <div className="flex items-start gap-3">
            <Avatar name={m.from_name} email={m.from_email} size={40} />
            <div className="min-w-0 flex-1 text-[13px]">
              <p><span className="font-semibold">{m.from_name || m.from_email}</span> <span className="ip-muted">&lt;{m.from_email}&gt;</span></p>
              <p className="ip-muted truncate">to {(m.to_addrs ?? []).map((a) => a.name || a.email).join(", ")}{m.cc_addrs?.length ? `, cc ${m.cc_addrs.map((a) => a.name || a.email).join(", ")}` : ""}</p>
            </div>
            <span className="ip-muted flex-none text-[12px]">{new Date(m.received_at).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}</span>
          </div>

          <div className="ip-card p-4 md:p-5">
            {m.body_text ? <div className="ip-body-text">{m.body_text}</div> : <p className="ip-muted">{m.snippet}</p>}
            <p className="ip-muted mt-3 text-[11px]">
              {m.body_source === "provider" ? "Content fetched from your mailbox for viewing; not stored (your retention setting)." : m.body_source === "unavailable" ? "Full content isn't stored (metadata-first mode). Showing Gmail's preview." : "Stored copy; deleted automatically after your retention period."}
            </p>
            {(m.attachments ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.attachments.map((a) => (
                  <span key={a.filename} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ip-line">
                    {a.mimeType.includes("pdf") ? <FileText size={15} style={{ color: "var(--ip-crit)" }} /> : <Paperclip size={15} />}
                    <span>{a.filename}</span>
                    <span className="ip-muted">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {d.thread.length > 1 && (
            <section>
              <h2 className="mb-2 text-[13px] font-semibold">Conversation ({d.thread.length})</h2>
              <ol className="space-y-1.5">
                {d.thread.map((t) => (
                  <li key={t.id} className={`rounded-lg border px-3 py-2 text-[12.5px] ip-line ${t.id === m.id ? "" : "ip-hover"}`} style={t.id === m.id ? { background: "var(--ip-accent-soft)" } : undefined}>
                    <span className="font-medium">{t.is_sent ? "You" : t.from_name || t.from_email}</span>
                    {t.signals?.autoReply && <span className="ip-chip ml-1">auto-reply</span>}
                    <span className="ip-muted"> · {timeLabel(t.received_at, tz)}</span>
                    <p className="ip-muted truncate">{t.snippet}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {d.drafts.length > 0 && (
            <div className="ip-card p-3 text-[13px]">
              <p className="font-medium">You have {d.drafts.length} unsent draft{d.drafts.length === 1 ? "" : "s"} here.</p>
              <button className="ip-btn ip-btn-sm mt-2" onClick={() => setComposer(`draft:${d.drafts[0].id}`)}>Continue draft</button>
            </div>
          )}
        </article>

        <aside className="space-y-4" aria-label="Message intelligence">
          <AiSummary key={m.id} id={m.id} />
          <SuggestedActions onReply={() => setComposer("reply_ai")} onTask={() => setTaskOpen(true)} onFollowup={() => setFuOpen(true)} onSnooze={() => snooze("later_today")} />
          <Suggestions d={d} />
          <Tracked d={d} />
          <WhyHere d={d} />
          <SenderControls d={d} />
        </aside>
      </div>
      {composer && <Composer messageId={m.id} accountId={d.account.id} mode={composer} onClose={() => setComposer(null)} />}
      <TaskDialog open={taskOpen} messageId={m.id} onClose={() => setTaskOpen(false)} />
      <FollowupDialog open={fuOpen} message={m} onClose={() => setFuOpen(false)} />
    </div>
  );
}

function Panel({ title, icon: Icon, children, right }: { title: string; icon?: typeof Sparkles; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="ip-card p-4">
      <div className="mb-2 flex items-center gap-1.5">
        {Icon && <Icon size={15} style={{ color: "var(--ip-accent)" }} />}
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

function AiSummary({ id }: { id: string }) {
  const [res, setRes] = useState<{ bullets: { text: string }[]; next_steps: { text: string }[]; model: string; content_level: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setRes(await api(`/messages/${id}/summary`, { method: "POST" }));
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };
  return (
    <Panel title="AI Summary" icon={Sparkles} right={!res && <button className="ip-btn ip-btn-sm" onClick={run} disabled={busy}>{busy ? <Spinner size={12} /> : "Summarize"}</button>}>
      {res ? (
        <>
          <ul className="list-disc space-y-1 pl-4 text-[13px]">{res.bullets.map((b, i) => <li key={i}>{b.text}</li>)}</ul>
          {res.next_steps.length > 0 && (
            <>
              <p className="ip-muted mt-2 text-[11px] font-semibold uppercase tracking-wider">Suggested next steps</p>
              <ul className="list-disc space-y-1 pl-4 text-[13px]">{res.next_steps.map((b, i) => <li key={i}>{b.text}</li>)}</ul>
            </>
          )}
          <p className="ip-muted mt-2 text-[11px]">AI-generated by {res.model} from {res.content_level === "metadata" ? "headers only" : res.content_level === "snippet" ? "headers + preview" : "message text"}. Check the original before acting.</p>
        </>
      ) : err ? (
        <p className="text-[12.5px]" style={{ color: "var(--ip-warn)" }}>{err}</p>
      ) : (
        <p className="ip-muted text-[12.5px]">Summarize this conversation and suggest next steps. Uses AI only if you&apos;ve allowed it in Settings.</p>
      )}
    </Panel>
  );
}

function SuggestedActions({ onReply, onTask, onFollowup, onSnooze }: { onReply: () => void; onTask: () => void; onFollowup: () => void; onSnooze: () => void }) {
  const items = [
    { label: "Draft reply", sub: "AI writes, you review", Icon: Reply, run: onReply },
    { label: "Create task", sub: "Track this request", Icon: CheckSquare, run: onTask },
    { label: "Add follow-up", sub: "Remind me", Icon: Clock, run: onFollowup },
    { label: "Snooze", sub: "Later today", Icon: AlarmClock, run: onSnooze },
  ];
  return (
    <Panel title="Suggested actions">
      <div className="grid grid-cols-2 gap-2">
        {items.map(({ label, sub, Icon, run }) => (
          <button key={label} onClick={run} className="ip-hover flex flex-col items-start rounded-xl border p-2.5 text-left ip-line">
            <Icon size={15} style={{ color: "var(--ip-accent)" }} />
            <span className="mt-1 text-[12.5px] font-semibold">{label}</span>
            <span className="ip-muted text-[11px]">{sub}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function Suggestions({ d }: { d: MessageDetail }) {
  const toast = useToast();
  const act = useAct((a: { id: string; op: string }) => api("/executions", { method: "POST", json: a }));
  const list = d.suggestions.filter((s) => s.status === "suggested" || s.status === "applied" || s.status === "approved");
  if (!list.length) return null;
  return (
    <Panel title="From your rules">
      <ul className="space-y-2 text-[12.5px]">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              {label(s.action.kind)}{s.action.value ? `: ${s.action.value}` : ""} <span className="ip-muted">({s.rule_name})</span>
              {s.status !== "suggested" && <span className="ip-chip ml-1">{s.status}</span>}
            </span>
            {s.status === "suggested" ? (
              <>
                <button className="ip-btn ip-btn-sm" aria-label="Approve" onClick={() => act.mutate({ id: s.id, op: "approve" }, { onError: (e) => toast({ text: errText(e), tone: "error" }) })}><Check size={12} /></button>
                <button className="ip-btn ip-btn-sm ip-btn-ghost" aria-label="Dismiss" onClick={() => act.mutate({ id: s.id, op: "dismiss" })}><X size={12} /></button>
              </>
            ) : s.undo ? (
              <button className="ip-btn ip-btn-sm" onClick={() => act.mutate({ id: s.id, op: "undo" }, { onError: (e) => toast({ text: errText(e), tone: "error" }) })}>Undo</button>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Tracked({ d }: { d: MessageDetail }) {
  const upd = useAct((a: { id: string; body: Record<string, unknown> }) => api(`/followups/${a.id}`, { method: "PATCH", json: a.body }));
  const fus = d.followups.filter((f) => f.status === "open" || f.status === "snoozed");
  if (!fus.length && !d.tasks.length) return null;
  return (
    <Panel title="Tracking">
      <ul className="space-y-2 text-[12.5px]">
        {fus.map((f) => (
          <li key={f.id}>
            <p className="font-medium">{f.kind === "i_owe" ? "You owe a reply" : f.kind === "they_owe" ? "Waiting on them" : "Your commitment"}{f.due_at ? ` · ${dueLabel(f.due_at)}${f.due_explicit ? "" : " (inferred)"}` : ""}</p>
            <p className="ip-muted">“{f.evidence}”</p>
            <div className="mt-1 flex gap-1.5">
              <button className="ip-btn ip-btn-sm" onClick={() => upd.mutate({ id: f.id, body: { status: "done" } })}>Done</button>
              <button className="ip-btn ip-btn-sm" onClick={() => upd.mutate({ id: f.id, body: { snooze: "tomorrow" } })}>Snooze</button>
              <button className="ip-btn ip-btn-sm ip-btn-ghost" onClick={() => upd.mutate({ id: f.id, body: { disable_tracking: true } })}>Stop tracking</button>
            </div>
          </li>
        ))}
        {d.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-1.5"><CheckSquare size={13} /> {t.title} <span className="ip-chip ml-auto">{t.status}</span></li>
        ))}
      </ul>
    </Panel>
  );
}

function WhyHere({ d }: { d: MessageDetail }) {
  const c = d.classification;
  const toast = useToast();
  const fix = useAct((b: { field: string; value: string; for_sender?: boolean }) => api(`/messages/${d.message.id}`, { method: "PATCH", json: { correct: b } }), { onSuccess: () => toast({ text: "Thanks. Future mail from this sender will follow your correction.", tone: "ok" }) });
  if (!c) return null;
  const sel = (field: "importance" | "msg_type" | "action", options: readonly string[]) => (
    <label className="flex items-center justify-between gap-2">
      <span className="ip-muted capitalize">{field === "msg_type" ? "type" : field}</span>
      <select className="ip-select !h-7 !w-36 text-[12px]" value={c[field]} onChange={(e) => fix.mutate({ field, value: e.target.value })}>
        {options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
      </select>
    </label>
  );
  return (
    <Panel title="Why it's here">
      <p className="text-[12.5px]">{c.explanation}</p>
      <p className="ip-muted mt-1 text-[11.5px]">
        Score {c.priority_score}/100 · confidence {Math.round(c.confidence * 100)}% · {c.source === "user" ? "corrected by you" : c.source === "ai" ? `rules + AI (${c.model})` : c.source === "rules" ? "your rules" : "rules-based"} · {label(c.time_sensitivity)}
      </p>
      <details className="mt-1.5 text-[12px]">
        <summary className="ip-muted cursor-pointer">All factors</summary>
        <ul className="mt-1 space-y-0.5">
          {c.factors.map((f, i) => (
            <li key={i} className="flex justify-between gap-2"><span>{f.label}</span><span className="ip-muted">{f.weight > 0 ? `+${f.weight}` : f.weight || ""}</span></li>
          ))}
        </ul>
      </details>
      <div className="mt-2.5 space-y-1.5 border-t pt-2.5 text-[12.5px] ip-line">
        <p className="ip-muted text-[11px] font-semibold uppercase tracking-wider">Correct it</p>
        {sel("importance", IMPORTANCE)}
        {sel("msg_type", MSG_TYPES)}
        {sel("action", ACTIONS)}
      </div>
    </Panel>
  );
}

function SenderControls({ d }: { d: MessageDetail }) {
  const s = d.sender;
  const toast = useToast();
  const upd = useAct((b: Record<string, unknown>) => api(`/senders/${s!.id}`, { method: "PATCH", json: b }), { onSuccess: () => toast({ text: "Sender updated.", tone: "ok" }) });
  if (!s || d.message.is_sent) return null;
  return (
    <Panel title="Sender">
      <p className="text-[12.5px]">{s.display_name || s.email}</p>
      <p className="ip-muted text-[11.5px]">{s.received_count} received · you replied {s.replied_count}× · first seen {s.first_seen ? new Date(s.first_seen).toLocaleDateString() : "—"}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="ip-btn ip-btn-sm" onClick={() => upd.mutate({ is_vip: !s.is_vip })}><Star size={12} fill={s.is_vip ? "currentColor" : "none"} /> {s.is_vip ? "VIP" : "Mark VIP"}</button>
        <button className="ip-btn ip-btn-sm" onClick={() => upd.mutate({ screening: s.screening === "screened_out" ? "approved" : "screened_out" })}><UserX size={12} /> {s.screening === "screened_out" ? "Un-screen" : "Screen out"}</button>
      </div>
    </Panel>
  );
}
