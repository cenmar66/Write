// The executive briefing. Built deterministically from stored data, so it never invents
// anything: each item points at the message, task or follow-up it came from. An optional
// AI summary may be added on top; its sentences are kept only if they cite real items.

import type { ClassificationRow, FollowupRow, MessageRow, TaskRow } from "./types";

export type RefType = "message" | "task" | "followup";
export interface BriefRef {
  type: RefType;
  id: string;
}
export interface BriefItem {
  key: string;
  text: string;
  detail?: string;
  refs: BriefRef[];
  inferred: boolean;
  due?: string | null;
  due_explicit?: boolean;
  importance?: string;
}
export interface BriefSection {
  id: "summary" | "critical" | "important" | "pending_replies" | "waiting" | "commitments" | "follow_ups" | "priorities" | "can_wait" | "changes";
  title: string;
  items: BriefItem[];
}
export interface BriefingContent {
  generated_at: string;
  period: { start: string; end: string };
  sections: BriefSection[];
  counts: Record<string, number>;
  ai_summary?: { text: string; refs: BriefRef[] }[];
  ai_note?: string;
}

type Msg = Pick<MessageRow, "id" | "from_email" | "from_name" | "subject" | "received_at" | "is_sent" | "done_at" | "snoozed_until" | "category"> & { c?: Pick<ClassificationRow, "importance" | "priority_score" | "action" | "time_sensitivity" | "msg_type" | "category" | "explanation"> | null };

const who = (m: Pick<MessageRow, "from_name" | "from_email">) => m.from_name || m.from_email;
const day = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });

export function buildBriefing(input: {
  now: Date;
  since: Date;
  tz: string;
  messages: Msg[]; // recent messages (≈ last 7 days) with classifications
  followups: FollowupRow[];
  tasks: TaskRow[];
  previousCounts?: Record<string, number> | null;
  mode: "concise" | "expanded";
}): BriefingContent {
  const { now, since, tz } = input;
  const limit = input.mode === "concise" ? 5 : 15;
  const active = input.messages.filter((m) => !m.is_sent && !m.done_at && !(m.snoozed_until && new Date(m.snoozed_until) > now));
  const inPeriod = active.filter((m) => new Date(m.received_at) >= since);
  const byScore = (a: Msg, b: Msg) => (b.c?.priority_score ?? 0) - (a.c?.priority_score ?? 0);
  const msgItem = (m: Msg, inferredNote?: string): BriefItem => ({
    key: `m:${m.id}`,
    text: `${who(m)}: ${m.subject || "(no subject)"}`,
    detail: inferredNote ?? m.c?.explanation,
    refs: [{ type: "message", id: m.id }],
    inferred: false,
    importance: m.c?.importance,
  });

  const critical = active.filter((m) => m.c?.importance === "critical").sort(byScore);
  const important = inPeriod.filter((m) => m.c?.importance === "high").sort(byScore);
  const open = input.followups.filter((f) => f.status === "open" || (f.status === "snoozed" && f.snoozed_until && new Date(f.snoozed_until) <= now));
  const iOwe = open.filter((f) => f.kind === "i_owe");
  const theyOwe = open.filter((f) => f.kind === "they_owe");
  const commitments = open.filter((f) => f.kind === "commitment");
  const overdue = theyOwe.filter((f) => f.due_at && new Date(f.due_at) < now);
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const tasksDue = input.tasks.filter((t) => (t.status === "open" || t.status === "in_progress") && t.due_date && new Date(`${t.due_date}T23:59:59`) <= weekAhead);
  const canWait = inPeriod.filter((m) => ["low"].includes(m.c?.importance ?? "") || ["newsletters", "notifications", "low_priority", "receipts"].includes(m.category ?? m.c?.category ?? ""));

  const fuItem = (f: FollowupRow): BriefItem => ({
    key: `f:${f.id}`,
    text: f.title,
    detail: f.evidence ? `“${f.evidence}”` : undefined,
    refs: [{ type: "followup", id: f.id }, ...(f.message_id ? [{ type: "message" as const, id: f.message_id }] : [])],
    inferred: f.detected_by !== "user",
    due: f.due_at,
    due_explicit: f.due_explicit,
  });
  const taskItem = (t: TaskRow): BriefItem => ({
    key: `t:${t.id}`,
    text: t.title,
    detail: t.due_date ? `Due ${day(`${t.due_date}T12:00:00Z`, "UTC")}${t.provenance?.due_date === "inferred" ? " (inferred)" : ""}` : undefined,
    refs: [{ type: "task", id: t.id }, ...(t.message_id ? [{ type: "message" as const, id: t.message_id }] : [])],
    inferred: t.provenance?.due_date === "inferred",
    due: t.due_date,
    due_explicit: t.provenance?.due_date === "explicit",
  });

  // Suggested priorities: critical first, then overdue/explicit-due-soon items, then high.
  const prio: BriefItem[] = [];
  const seen = new Set<string>();
  const push = (i: BriefItem) => {
    if (seen.has(i.refs[0].id) || prio.length >= 3) return;
    seen.add(i.refs[0].id);
    prio.push(i);
  };
  critical.slice(0, 2).forEach((m) => push(msgItem(m)));
  [...iOwe].filter((f) => f.due_at && new Date(f.due_at) <= new Date(now.getTime() + 2 * 86_400_000)).forEach((f) => push(fuItem(f)));
  tasksDue.filter((t) => t.due_date! <= now.toISOString().slice(0, 10)).forEach((t) => push(taskItem(t)));
  important.forEach((m) => push(msgItem(m)));

  const counts = {
    new_messages: inPeriod.length,
    critical: critical.length,
    important: important.length,
    pending_replies: iOwe.length,
    waiting: theyOwe.length,
    overdue_followups: overdue.length,
    commitments: commitments.length + tasksDue.length,
    can_wait: canWait.length,
  };
  const prev = input.previousCounts;
  const changes: BriefItem[] = prev
    ? (Object.keys(counts) as (keyof typeof counts)[])
        .filter((k) => prev[k] !== undefined && prev[k] !== counts[k])
        .map((k) => ({ key: `c:${k}`, text: `${label(k)}: ${prev[k]} → ${counts[k]}`, refs: [], inferred: false }))
    : [];

  const summary: BriefItem[] = [];
  if (critical.length) summary.push({ key: "s:critical", text: `${critical.length} critical ${plural(critical.length, "message")} ${critical.length === 1 ? "needs" : "need"} you, starting with ${who(critical[0])}.`, refs: critical.slice(0, 3).map((m) => ({ type: "message" as const, id: m.id })), inferred: false });
  if (iOwe.length) summary.push({ key: "s:owe", text: `${iOwe.length} ${plural(iOwe.length, "person is", "people are")} waiting for your reply.`, refs: iOwe.slice(0, 3).map((f) => ({ type: "followup" as const, id: f.id })), inferred: false });
  if (overdue.length) summary.push({ key: "s:overdue", text: `${overdue.length} ${plural(overdue.length, "conversation")} you're waiting on ${overdue.length === 1 ? "is" : "are"} past the follow-up date.`, refs: overdue.slice(0, 3).map((f) => ({ type: "followup" as const, id: f.id })), inferred: false });
  if (tasksDue.length || commitments.length) summary.push({ key: "s:due", text: `${tasksDue.length + commitments.length} ${plural(tasksDue.length + commitments.length, "commitment")} in the next 7 days.`, refs: [...tasksDue.slice(0, 2).map((t) => ({ type: "task" as const, id: t.id })), ...commitments.slice(0, 2).map((f) => ({ type: "followup" as const, id: f.id }))], inferred: false });
  if (canWait.length) summary.push({ key: "s:wait", text: `${canWait.length} newsletters, notifications and low-priority messages can wait.`, refs: canWait.slice(0, 3).map((m) => ({ type: "message" as const, id: m.id })), inferred: false });
  if (!summary.length) summary.push({ key: "s:clear", text: inPeriod.length ? "Nothing urgent. Your inbox is under control." : "No new mail since your last briefing.", refs: [], inferred: false });

  const sections: BriefSection[] = [
    { id: "summary", title: "Executive summary", items: summary },
    { id: "critical", title: "Critical matters", items: critical.slice(0, limit).map((m) => msgItem(m)) },
    { id: "important", title: "Important new messages", items: important.slice(0, limit).map((m) => msgItem(m)) },
    { id: "pending_replies", title: "Waiting for your reply", items: iOwe.slice(0, limit).map(fuItem) },
    { id: "waiting", title: "You're waiting on", items: theyOwe.filter((f) => !overdue.includes(f)).slice(0, limit).map(fuItem) },
    { id: "follow_ups", title: "Follow-ups worth sending", items: overdue.slice(0, limit).map(fuItem) },
    { id: "commitments", title: "Upcoming commitments", items: [...tasksDue.map(taskItem), ...commitments.map(fuItem)].sort((a, b) => String(a.due ?? "9").localeCompare(String(b.due ?? "9"))).slice(0, limit) },
    { id: "priorities", title: "Suggested priorities", items: prio },
    { id: "can_wait", title: "Can safely wait", items: input.mode === "expanded" ? canWait.slice(0, limit).map((m) => msgItem(m)) : canWait.length ? [{ key: "cw", text: `${canWait.length} lower-priority ${plural(canWait.length, "message")}`, refs: canWait.slice(0, 1).map((m) => ({ type: "message" as const, id: m.id })), inferred: false }] : [] },
    { id: "changes", title: "Changed since last briefing", items: changes },
  ];
  return { generated_at: now.toISOString(), period: { start: since.toISOString(), end: now.toISOString() }, sections, counts };
}

function label(k: string) {
  return ({ new_messages: "New messages", critical: "Critical", important: "Important", pending_replies: "Waiting for your reply", waiting: "You're waiting on", overdue_followups: "Overdue follow-ups", commitments: "Commitments", can_wait: "Can wait" } as Record<string, string>)[k] ?? k;
}
const plural = (n: number, one: string, many?: string) => (n === 1 ? one : many ?? `${one}s`);

/** Lines fed to the optional AI summary (refs are the item keys). */
export function briefingLinesForAi(c: BriefingContent): { ref: string; line: string }[] {
  return c.sections
    .filter((s) => s.id !== "summary" && s.id !== "changes")
    .flatMap((s) => s.items.map((i) => ({ ref: i.key, line: `[${s.title}] ${i.text}${i.due ? ` (due ${i.due}${i.due_explicit ? "" : ", inferred"})` : ""}` })));
}

/** Which scheduled briefing slot is due now (local time), if any. */
export function dueSlot(prefs: { morning: string | null; midday: string | null; evening: string | null }, tz: string, now: Date, lastBySlot: Record<string, string | undefined>): "morning" | "midday" | "evening" | null {
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => local.find((p) => p.type === t)?.value ?? "00";
  const hm = `${get("hour")}:${get("minute")}`;
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  for (const slot of ["evening", "midday", "morning"] as const) {
    const at = prefs[slot];
    if (!at || hm < at) continue;
    const last = lastBySlot[slot];
    const lastDay = last ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(last)) : null;
    if (lastDay !== today) return slot;
    return null;
  }
  return null;
}
