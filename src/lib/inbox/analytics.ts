// Productivity analytics, computed from stored rows. Estimates are labelled as such and
// carry their assumptions; measured numbers are counts of real rows.

import type { ClassificationRow, FollowupRow, MessageRow, TaskRow } from "./types";

export interface AnalyticsInput {
  from: Date;
  to: Date;
  messages: (Pick<MessageRow, "id" | "received_at" | "is_sent" | "is_unread" | "thread_id" | "from_email" | "done_at" | "account_id"> & { c?: Pick<ClassificationRow, "importance" | "category" | "msg_type" | "user_corrected" | "source"> | null })[];
  followups: Pick<FollowupRow, "kind" | "status" | "due_at" | "created_at">[];
  tasks: Pick<TaskRow, "created_at" | "message_id" | "status">[];
  feedbackCount: number;
  ai: { requests: number; cost: number; input: number; output: number };
  assumptions?: Partial<TimeSavedAssumptions>;
}

export interface TimeSavedAssumptions {
  secondsPerLowValueTriaged: number;
  secondsPerBriefingItem: number;
  secondsPerDraft: number;
}
export const DEFAULT_ASSUMPTIONS: TimeSavedAssumptions = { secondsPerLowValueTriaged: 6, secondsPerBriefingItem: 20, secondsPerDraft: 120 };

const dayKey = (iso: string) => iso.slice(0, 10);

export function computeAnalytics(input: AnalyticsInput & { draftsCreated: number }) {
  const inRange = (iso: string) => {
    const t = new Date(iso);
    return t >= input.from && t <= input.to;
  };
  const msgs = input.messages.filter((m) => inRange(m.received_at));
  const incoming = msgs.filter((m) => !m.is_sent);
  const sent = msgs.filter((m) => m.is_sent);
  const lowValue = incoming.filter((m) => m.c?.importance === "low" || ["newsletters", "low_priority", "notifications"].includes(m.c?.category ?? ""));
  const high = incoming.filter((m) => m.c?.importance === "high" || m.c?.importance === "critical");
  const newsletters = incoming.filter((m) => m.c?.msg_type === "newsletter");

  // Response time: first reply I sent after an incoming human message in the same thread.
  const byThread = new Map<string, typeof msgs>();
  for (const m of input.messages) if (m.thread_id) byThread.set(m.thread_id, [...(byThread.get(m.thread_id) ?? []), m]);
  const responseHours: number[] = [];
  for (const m of incoming.filter((x) => !["newsletters", "notifications", "low_priority", "receipts"].includes(x.c?.category ?? ""))) {
    const reply = (byThread.get(m.thread_id ?? "") ?? []).filter((x) => x.is_sent && x.received_at > m.received_at).sort((a, b) => a.received_at.localeCompare(b.received_at))[0];
    if (reply) responseHours.push((Date.parse(reply.received_at) - Date.parse(m.received_at)) / 3_600_000);
  }
  responseHours.sort((a, b) => a - b);
  const median = responseHours.length ? responseHours[Math.floor(responseHours.length / 2)] : null;

  const days: Record<string, { day: string; incoming: number; high: number; low: number; sent: number; unread: number }> = {};
  for (let d = new Date(input.from); d <= input.to; d = new Date(d.getTime() + 86_400_000)) days[dayKey(d.toISOString())] = { day: dayKey(d.toISOString()), incoming: 0, high: 0, low: 0, sent: 0, unread: 0 };
  for (const m of msgs) {
    const row = days[dayKey(m.received_at)];
    if (!row) continue;
    if (m.is_sent) row.sent++;
    else {
      row.incoming++;
      if (high.includes(m)) row.high++;
      if (lowValue.includes(m)) row.low++;
      if (m.is_unread) row.unread++;
    }
  }

  const classified = incoming.filter((m) => m.c);
  const corrected = classified.filter((m) => m.c?.user_corrected).length;
  const a = { ...DEFAULT_ASSUMPTIONS, ...(input.assumptions ?? {}) };
  const briefingItems = high.length;
  const timeSavedMin = (lowValue.length * a.secondsPerLowValueTriaged + briefingItems * a.secondsPerBriefingItem + input.draftsCreated * a.secondsPerDraft) / 60;

  return {
    range: { from: input.from.toISOString(), to: input.to.toISOString() },
    measured: {
      incoming: incoming.length,
      sent: sent.length,
      high_priority: high.length,
      low_value: lowValue.length,
      newsletters: newsletters.length,
      processed: incoming.filter((m) => m.done_at || !m.is_unread).length,
      unread: incoming.filter((m) => m.is_unread).length,
      median_response_hours: median,
      responses_measured: responseHours.length,
      outstanding_conversations: input.followups.filter((f) => f.status === "open" && f.kind !== "commitment").length,
      overdue_followups: input.followups.filter((f) => f.status === "open" && f.kind === "they_owe" && f.due_at && new Date(f.due_at) < input.to).length,
      tasks_from_email: input.tasks.filter((t) => t.message_id && inRange(t.created_at)).length,
      drafts_created: input.draftsCreated,
      classified: classified.length,
      corrections: corrected,
      ai_requests: input.ai.requests,
      ai_cost_usd: Number(input.ai.cost.toFixed(4)),
      ai_tokens: input.ai.input + input.ai.output,
    },
    // Share of classifications the user didn't need to correct. Not true accuracy: uncorrected ≠ correct.
    agreement_rate: classified.length ? 1 - corrected / classified.length : null,
    estimated: {
      time_saved_minutes: Math.round(timeSavedMin),
      assumptions: a,
      note: "Estimate, not a measurement: low-value messages you didn't have to triage × seconds each + high-priority items surfaced × seconds each + AI drafts × seconds each.",
    },
    daily: Object.values(days),
  };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Neutralise spreadsheet formulas (CSV injection) and quote when needed.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
