"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Clock, Inbox, MailWarning, Reply, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useAct, useBriefing, useFollowups, useMessages, useTasks, type Execution } from "./api";
import { useScope } from "./shell";
import { Avatar, dueLabel, Empty, ImportanceChip, Skeleton, Spinner, ago, timeLabel, useToast, errText } from "./ui";
import { BriefItems } from "./brief";
import { Bars } from "./analytics";

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomePage() {
  const { ws, boot } = useScope();
  const tz = boot.prefs.timezone;
  const priority = useMessages(ws, "priority");
  const fus = useFollowups(ws);
  const tasks = useTasks(ws);
  const brief = useBriefing();
  const suggestions = useQuery({ queryKey: ["executions", ws, "suggested"], queryFn: () => api<{ executions: Execution[] }>(`/executions?ws=${ws}&status=suggested`).then((r) => r.executions) });
  const stats = useQuery({ queryKey: ["analytics", ws, 7], queryFn: () => api<{ measured: Record<string, number | null>; daily: { day: string; incoming: number; high: number; low: number }[]; estimated: { time_saved_minutes: number; note: string } }>(`/analytics?ws=${ws}&range=7`) });
  const toast = useToast();
  const briefNow = useAct(() => api("/briefings", { method: "POST", json: { ws } }), { onSuccess: () => toast({ text: "Briefing updated.", tone: "ok" }) });

  const now = new Date();
  const iOwe = (fus.data ?? []).filter((f) => f.kind === "i_owe");
  const theyOwe = (fus.data ?? []).filter((f) => f.kind === "they_owe");
  const overdueOwe = iOwe.filter((f) => f.due_at && new Date(f.due_at) < now).length;
  const [nowMs] = useState(() => Date.now());
  const commitments = useMemo(() => {
    const weekAhead = new Date(nowMs + 7 * 86_400_000);
    return [
        ...(fus.data ?? []).filter((f) => f.kind === "commitment" || (f.kind === "they_owe" && f.due_explicit)).map((f) => ({ key: `f${f.id}`, title: f.title, due: f.due_at, explicit: f.due_explicit, href: f.message_id ? `/inbox/mail?view=all&m=${f.message_id}` : "/inbox/followups", from: f.counterpart })),
        ...(tasks.data ?? []).filter((t) => t.due_date).map((t) => ({ key: `t${t.id}`, title: t.title, due: t.due_date, explicit: t.provenance?.due_date === "explicit" || t.provenance?.due_date === "user", href: `/inbox/followups?task=${t.id}`, from: t.source_ref?.from ?? "" })),
      ]
        .filter((c) => c.due && new Date(c.due.length === 10 ? `${c.due}T23:59:59` : c.due) <= weekAhead)
      .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  }, [fus.data, tasks.data, nowMs]);
  const timeSensitive = (priority.data ?? []).filter((m) => ["immediate", "today"].includes(m.c?.time_sensitivity ?? "")).length;
  const noAccounts = boot.accounts.length === 0;

  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8 md:py-7">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-[24px] font-bold tracking-tight md:text-[28px]">{greeting(tz)}.</h1>
            <p className="ip-muted">Here is what needs your attention.</p>
          </div>
          <p className="ip-muted text-[13px]">{now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: tz })}</p>
        </div>

        {noAccounts && (
          <div className="ip-card flex flex-wrap items-center gap-3 p-4">
            <MailWarning size={18} style={{ color: "var(--ip-accent)" }} />
            <p className="flex-1">No mailbox connected yet. Connect Gmail, or try InboxPilot with the clearly-labelled demo mailbox.</p>
            <Link href="/inbox/accounts" className="ip-btn ip-btn-primary">Connect an account</Link>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="At a glance">
          <Stat href="/inbox/mail?view=priority" icon={AlertTriangle} tone="crit" n={priority.data?.length} label="Priority emails" sub={timeSensitive ? `${timeSensitive} time sensitive` : "Nothing time sensitive"} />
          <Stat href="/inbox/followups?tab=i_owe" icon={Reply} tone="info" n={fus.data ? iOwe.length : undefined} label="Replies due" sub={overdueOwe ? `${overdueOwe} overdue` : "None overdue"} />
          <Stat href="/inbox/followups?tab=they_owe" icon={Clock} tone="mid" n={fus.data ? theyOwe.length : undefined} label="Follow-ups waiting" sub="You're waiting on people" />
          <Stat href="/inbox/followups?tab=upcoming" icon={CalendarClock} tone="teal" n={fus.data && tasks.data ? commitments.length : undefined} label="Upcoming deadlines" sub="Next 7 days" />
        </section>

        <section className="ip-card p-4 md:p-5" aria-labelledby="brief-h">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={18} style={{ color: "var(--ip-accent)" }} />
            <h2 id="brief-h" className="text-[16px] font-semibold">Daily Brief</h2>
            {brief.data?.briefing && <span className="ip-muted text-[12px]">· {ago(brief.data.briefing.created_at)}</span>}
            <div className="ml-auto flex gap-2">
              <Link href="/inbox/brief" className="ip-btn ip-btn-sm">Full brief</Link>
              <button className="ip-btn ip-btn-sm ip-btn-primary" onClick={() => briefNow.mutate(undefined)} disabled={briefNow.isPending}>
                {briefNow.isPending ? <Spinner size={13} /> : <Sparkles size={13} />} Brief me now
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_240px]">
            <div>
              {brief.isLoading ? <Skeleton rows={3} /> : brief.data?.briefing ? <BriefItems content={brief.data.briefing.content} section="summary" compact /> : <p className="ip-muted text-[13px]">No briefing yet. Press “Brief me now”: it&apos;s built from your actual messages, and every line links to its source.</p>}
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--ip-accent-soft)" }}>
              <p className="text-[12.5px] font-medium">Last 7 days</p>
              {stats.data ? (
                <>
                  <p className="mt-1 text-[13px]">
                    {stats.data.measured.incoming} received · {stats.data.measured.high_priority} important · {stats.data.measured.low_value} low-value
                  </p>
                  <Bars data={stats.data.daily.map((d) => ({ label: d.day.slice(5), value: d.incoming, accent: d.high }))} height={56} />
                  <Link href="/inbox/analytics" className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "var(--ip-accent)" }}>
                    View analytics <ArrowRight size={12} />
                  </Link>
                </>
              ) : (
                <div className="ip-skeleton mt-2 h-16" />
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="ip-card" aria-labelledby="conv-h">
            <Header id="conv-h" title="Important conversations" href="/inbox/mail?view=priority" />
            {priority.isLoading ? (
              <Skeleton rows={3} />
            ) : priority.data?.length ? (
              <ul>
                {priority.data.slice(0, 5).map((m) => (
                  <li key={m.id}>
                    <Link href={`/inbox/mail?view=priority&m=${m.id}`} className="ip-hover flex items-center gap-3 border-t px-4 py-2.5 ip-line">
                      <Avatar name={m.from_name} email={m.from_email} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.from_name || m.from_email}</p>
                        <p className="truncate text-[13px]">{m.subject}</p>
                        <p className="truncate text-[12px]" style={{ color: m.c?.action === "reply_needed" ? "var(--ip-high)" : "var(--ip-muted)" }}>
                          {m.c?.action === "reply_needed" ? "Needs reply" : m.c?.action === "review_needed" ? "Needs review" : m.c?.explanation} · {ago(m.received_at)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="ip-muted text-[12px]">{timeLabel(m.received_at, tz)}</span>
                        <ImportanceChip value={m.importance} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={Inbox} title="Nothing urgent">Important messages show up here.</Empty>
            )}
          </section>

          <section className="ip-card" aria-labelledby="commit-h">
            <Header id="commit-h" title="Upcoming commitments" href="/inbox/followups?tab=upcoming" />
            {fus.isLoading || tasks.isLoading ? (
              <Skeleton rows={3} />
            ) : commitments.length ? (
              <ul>
                {commitments.slice(0, 6).map((c) => (
                  <li key={c.key}>
                    <Link href={c.href} className="ip-hover flex items-center gap-3 border-t px-4 py-2.5 ip-line">
                      <CalendarClock size={16} style={{ color: "var(--ip-accent)" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.title}</p>
                        {c.from && <p className="ip-muted truncate text-[12px]">{c.from}</p>}
                      </div>
                      <div className="text-right text-[12px]">
                        <p style={{ color: new Date(c.due!) < now ? "var(--ip-high)" : undefined }}>{dueLabel(c.due, tz)}</p>
                        {!c.explicit && <p className="ip-muted">inferred date</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={CalendarClock} title="No deadlines this week">Dates stated in emails and your tasks appear here.</Empty>
            )}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Recommended items={suggestions.data ?? []} loading={suggestions.isLoading} reviewCount={boot.counts.review ?? 0} />
          <section className="ip-card p-4" aria-labelledby="health-h">
            <h2 id="health-h" className="font-semibold">Inbox health</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
              <Metric label="Unread" value={boot.counts.unread} href="/inbox/mail?view=all&q=is:unread" />
              <Metric label="Needs attention" value={boot.counts.attention} href="/inbox/mail?view=attention" />
              <Metric label="Uncertain" value={boot.counts.review} href="/inbox/mail?view=category:review" />
              <Metric label="Unread newsletters" value={boot.counts.unread_by_category?.newsletters ?? 0} href="/inbox/mail?view=category:newsletters" />
            </dl>
          </section>
          <section className="ip-card p-4" aria-labelledby="prod-h">
            <h2 id="prod-h" className="font-semibold">Productivity snapshot</h2>
            {stats.data ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                <Metric label="Median reply time" value={stats.data.measured.median_response_hours == null ? "—" : `${Number(stats.data.measured.median_response_hours).toFixed(1)}h`} />
                <Metric label="Tasks from email" value={stats.data.measured.tasks_from_email ?? 0} />
                <Metric label="Overdue follow-ups" value={stats.data.measured.overdue_followups ?? 0} />
                <Metric label="Time saved (estimate)" value={`~${stats.data.estimated.time_saved_minutes} min`} title={stats.data.estimated.note} />
              </dl>
            ) : (
              <div className="ip-skeleton mt-3 h-20" />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ href, icon: Icon, tone, n, label, sub }: { href: string; icon: typeof Inbox; tone: "crit" | "info" | "mid" | "teal"; n?: number; label: string; sub: string }) {
  return (
    <Link href={href} className="ip-card ip-hover flex items-start gap-3 p-4 transition-colors">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl" style={{ background: `var(--ip-${tone}-soft)`, color: `var(--ip-${tone})` }}>
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-[24px] font-bold leading-tight">{n ?? <span className="ip-skeleton inline-block h-6 w-8 align-middle" />}</p>
        <p className="text-[13px] font-medium">{label}</p>
        <p className="ip-muted truncate text-[12px]">{sub}</p>
      </div>
    </Link>
  );
}

function Header({ id, title, href }: { id: string; title: string; href: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <h2 id={id} className="font-semibold">{title}</h2>
      <Link href={href} className="text-[12.5px] font-medium" style={{ color: "var(--ip-accent)" }}>View all</Link>
    </div>
  );
}

function Metric({ label, value, href, title }: { label: string; value?: number | string; href?: string; title?: string }) {
  const body = (
    <>
      <dt className="ip-muted text-[12px]" title={title}>{label}</dt>
      <dd className="text-[18px] font-semibold">{value ?? 0}</dd>
    </>
  );
  return href ? <Link href={href} className="ip-hover -m-1.5 rounded-lg p-1.5">{body}</Link> : <div title={title}>{body}</div>;
}

const ACTION_LABEL: Record<string, string> = { gmail_archive: "Archive in Gmail", gmail_mark_read: "Mark read in Gmail", gmail_label: "Add Gmail label", suggest_task: "Create a task" };

function Recommended({ items, loading, reviewCount }: { items: Execution[]; loading: boolean; reviewCount: number }) {
  const toast = useToast();
  const router = useRouter();
  const act = useAct((a: { id: string; op: "approve" | "dismiss" }) => api<{ openTaskDialog?: string }>("/executions", { method: "POST", json: a }), {
    onSuccess: (r) => {
      if (r.openTaskDialog) router.push(`/inbox/mail?view=all&m=${r.openTaskDialog}&task=1`);
    },
  });
  return (
    <section className="ip-card p-4" aria-labelledby="rec-h">
      <h2 id="rec-h" className="font-semibold">Recommended actions</h2>
      <p className="ip-muted text-[12px]">Suggestions from your rules. Nothing happens until you approve.</p>
      <ul className="mt-2 space-y-2">
        {reviewCount > 0 && (
          <li className="flex items-center gap-2 text-[13px]">
            <span className="flex-1">Review {reviewCount} uncertain classification{reviewCount === 1 ? "" : "s"}</span>
            <Link href="/inbox/mail?view=category:review" className="ip-btn ip-btn-sm">Review</Link>
          </li>
        )}
        {loading && <div className="ip-skeleton h-8" />}
        {items.slice(0, 5).map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-[13px]">
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {ACTION_LABEL[e.action.kind] ?? e.action.kind}: {e.message?.subject ?? "message"}
              </p>
              <p className="ip-muted truncate text-[11.5px]">Rule “{e.rule_name}”</p>
            </div>
            <button className="ip-btn ip-btn-sm" aria-label="Approve" onClick={() => act.mutate({ id: e.id, op: "approve" }, { onError: (err) => toast({ text: errText(err), tone: "error" }) })}>
              <Check size={13} />
            </button>
            <button className="ip-btn ip-btn-sm ip-btn-ghost" aria-label="Dismiss" onClick={() => act.mutate({ id: e.id, op: "dismiss" })}>
              <X size={13} />
            </button>
          </li>
        ))}
        {!loading && !items.length && !reviewCount && <li className="ip-muted text-[13px]">You&apos;re all caught up.</li>}
      </ul>
    </section>
  );
}
