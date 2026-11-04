// Email → task suggestion. Deterministic first; AI may refine wording. Every field says
// whether it was stated in the email (explicit), guessed (inferred) or typed by the user.

import { firstDeadline } from "./deadlines";
import { stripQuoted } from "./mail/parse";
import type { ClassificationRow, MessageRow, SourceRef, TaskRow } from "./types";

export interface TaskSuggestion {
  title: string;
  description: string;
  due_date: string | null;
  priority: TaskRow["priority"];
  project: string | null;
  provenance: Record<string, "explicit" | "inferred">;
  evidence: string | null;
}

export function suggestTask(m: Pick<MessageRow, "subject" | "from_name" | "from_email" | "body_text" | "snippet" | "received_at">, c: Pick<ClassificationRow, "action" | "importance"> | null): TaskSuggestion {
  const subject = m.subject.replace(/^\s*((re|fwd?|aw|rv)\s*:\s*)+/i, "").trim() || "(no subject)";
  const who = m.from_name || m.from_email;
  const verb = c?.action === "reply_needed" ? "Reply to" : c?.action === "review_needed" ? "Review" : c?.action === "task_required" ? "Do" : "Follow up on";
  const title = verb === "Reply to" ? `Reply to ${who}: ${subject}` : `${verb}: ${subject}`;
  const text = stripQuoted(m.body_text ?? m.snippet ?? "");
  const deadline = firstDeadline(`${m.subject}. ${text}`, new Date(m.received_at));
  const priority: TaskRow["priority"] = c?.importance === "critical" ? "urgent" : c?.importance === "high" ? "high" : c?.importance === "low" ? "low" : "normal";
  return {
    title: title.slice(0, 200),
    description: `From ${who}${m.from_name ? ` <${m.from_email}>` : ""}.`,
    due_date: deadline ? deadline.date.slice(0, 10) : null,
    priority,
    project: null,
    provenance: { title: "inferred", priority: "inferred", ...(deadline ? { due_date: "explicit" as const } : {}) },
    evidence: deadline?.sentence ?? null,
  };
}

export function sourceRefFor(m: Pick<MessageRow, "provider_message_id" | "provider_thread_id" | "subject" | "from_email">, account: { email: string; provider: string }): SourceRef {
  return { provider: account.provider, provider_message_id: m.provider_message_id, provider_thread_id: m.provider_thread_id, account_email: account.email, subject: m.subject.slice(0, 300), from: m.from_email };
}
