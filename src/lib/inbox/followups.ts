// Conversation tracking: who owes whom a reply, and what people promised.
// Pure functions over a thread's messages. Automated replies, bounces and bulk mail
// never count as a human response.

import { addBusinessDays, businessDaysBetween, firstDeadline, sentences } from "./deadlines";
import { stripQuoted } from "./mail/parse";
import type { FollowupKind, MessageRow } from "./types";

export type ThreadMessage = Pick<
  MessageRow,
  "id" | "account_id" | "thread_id" | "provider_thread_id" | "from_email" | "from_name" | "to_addrs" | "cc_addrs" | "subject" | "snippet" | "body_text" | "received_at" | "is_sent" | "signals"
>;

export interface DetectedFollowup {
  kind: FollowupKind;
  title: string;
  counterpart: string;
  due_at: string | null;
  due_explicit: boolean;
  evidence: string;
  confidence: number;
  message_id: string;
  dedupe_key: string;
}

/** A real person wrote this (not an auto-reply, bounce, list or no-reply sender). */
export function isHumanMessage(m: Pick<ThreadMessage, "signals" | "from_email">): boolean {
  const s = m.signals ?? {};
  return !s.autoReply && !s.dsn && !s.bulk && !s.noreply && !!m.from_email;
}

const textOf = (m: ThreadMessage) => stripQuoted(m.body_text ?? m.snippet ?? "");
// A "Re:" subject repeats the other person's words, so it isn't a new request.
const ownSubject = (m: ThreadMessage) => (/^\s*(re|aw|sv|rv|fwd?)\s*:/i.test(m.subject) ? "" : m.subject);

const REQUEST = /(\?|¿)|\b(can you|could you|would you|will you|please (send|share|confirm|review|approve|let me know|sign|provide)|let me know|waiting (for|on) your|need (your|you to)|looking forward to (hearing|your)|puedes|podrías|me (envías|mandas|confirmas)|por favor (envía|confirma|revisa))\b/i;
const MY_PROMISE = /\b(i['’]?ll|i will|i am going to|i['’]?m going to|let me|we['’]?ll|we will)\s+(send|get back|follow up|share|have|prepare|review|check|look into|circle back|deliver|draft|call|confirm)\b|\b(te (envío|mando|confirmo)|le (enviaré|confirmaré)|voy a (enviar|revisar|preparar))\b/i;
const THEIR_PROMISE = MY_PROMISE;
const NEEDS_REPLY = /(\?|¿)|\b(please (reply|respond|confirm|let me know|advise)|let me know|your thoughts|can you|could you|would you|are you available|do you have|any update|what do you think|puedes|podrías|me confirmas|qué opinas)\b/i;

function shorten(s: string, n = 90) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function matchSentence(text: string, re: RegExp): string | null {
  return sentences(text).find((s) => re.test(s)) ?? null;
}

/**
 * Analyse one thread (messages from one account, any order).
 * `me` holds the account's own addresses. `now` and `thresholdDays` decide when an
 * unanswered outgoing request becomes a follow-up worth surfacing.
 */
export function analyzeThread(
  messages: ThreadMessage[],
  me: Set<string>,
  opts: { now: Date; thresholdDays: number },
): DetectedFollowup[] {
  if (!messages.length) return [];
  const msgs = [...messages].sort((a, b) => a.received_at.localeCompare(b.received_at));
  const mine = (m: ThreadMessage) => m.is_sent || me.has(m.from_email.toLowerCase());
  const human = msgs.filter((m) => mine(m) || isHumanMessage(m));
  const out: DetectedFollowup[] = [];
  const threadKey = msgs[0].provider_thread_id;
  const last = human[human.length - 1];
  if (!last) return [];

  // 1. Someone owes me: my last message asked for something and no human answered since.
  if (mine(last)) {
    const text = textOf(last);
    const ask = matchSentence(text, REQUEST) ?? (REQUEST.test(ownSubject(last)) ? last.subject : null);
    if (ask) {
      const sentAt = new Date(last.received_at);
      const counterpart = last.to_addrs?.[0]?.email ?? "";
      const waited = businessDaysBetween(sentAt, opts.now);
      const deadline = firstDeadline(text, sentAt);
      const due = deadline ? new Date(deadline.date) : addBusinessDays(sentAt, opts.thresholdDays);
      out.push({
        kind: "they_owe",
        title: `Waiting on ${last.to_addrs?.[0]?.name || counterpart || "a reply"}: ${shorten(last.subject || ask, 70)}`,
        counterpart,
        due_at: due.toISOString(),
        due_explicit: !!deadline,
        evidence: shorten(ask, 240),
        confidence: waited >= opts.thresholdDays ? 0.8 : 0.65,
        message_id: last.id,
        dedupe_key: `thread:${threadKey}:they_owe:${last.id}`,
      });
    }
  }

  // 2. I owe someone: their last human message needs a reply and I haven't sent one since.
  if (!mine(last) && isHumanMessage(last)) {
    const text = textOf(last);
    const ask = matchSentence(text, NEEDS_REPLY) ?? (NEEDS_REPLY.test(ownSubject(last)) ? last.subject : null);
    const addressedToMe = [...(last.to_addrs ?? [])].some((a) => me.has(a.email.toLowerCase()));
    if (ask && addressedToMe) {
      const deadline = firstDeadline(text, new Date(last.received_at));
      out.push({
        kind: "i_owe",
        title: `Reply to ${last.from_name || last.from_email}: ${shorten(last.subject || ask, 70)}`,
        counterpart: last.from_email,
        due_at: deadline ? deadline.date : null,
        due_explicit: !!deadline,
        evidence: shorten(ask, 240),
        confidence: 0.7,
        message_id: last.id,
        dedupe_key: `thread:${threadKey}:i_owe:${last.id}`,
      });
    }
  }

  // 3. Promises: what I committed to (I owe), and what others committed to (they owe).
  for (const m of human) {
    const text = textOf(m);
    const promise = matchSentence(text, mine(m) ? MY_PROMISE : THEIR_PROMISE);
    if (!promise) continue;
    const later = human.filter((x) => x.received_at > m.received_at);
    // A promise is considered kept once the promiser writes again in the thread.
    const kept = later.some((x) => (mine(m) ? mine(x) : x.from_email === m.from_email));
    if (kept) continue;
    const deadline = firstDeadline(promise, new Date(m.received_at));
    if (mine(m)) {
      out.push({
        kind: "commitment",
        title: `You promised: ${shorten(promise, 90)}`,
        counterpart: m.to_addrs?.[0]?.email ?? "",
        due_at: deadline?.date ?? null,
        due_explicit: !!deadline,
        evidence: shorten(promise, 240),
        confidence: deadline ? 0.75 : 0.6,
        message_id: m.id,
        dedupe_key: `thread:${threadKey}:commitment:${m.id}`,
      });
    } else if ([...(m.to_addrs ?? [])].some((a) => me.has(a.email.toLowerCase()))) {
      out.push({
        kind: "they_owe",
        title: `${m.from_name || m.from_email} promised: ${shorten(promise, 80)}`,
        counterpart: m.from_email,
        due_at: deadline?.date ?? null,
        due_explicit: !!deadline,
        evidence: shorten(promise, 240),
        confidence: deadline ? 0.75 : 0.6,
        message_id: m.id,
        dedupe_key: `thread:${threadKey}:promise:${m.id}`,
      });
    }
  }
  return out;
}

/** Follow-ups from earlier analysis that the new state of the thread has resolved. */
export function resolvedKeys(previousOpen: { dedupe_key: string }[], current: DetectedFollowup[]): string[] {
  const now = new Set(current.map((c) => c.dedupe_key));
  return previousOpen.filter((p) => !now.has(p.dedupe_key)).map((p) => p.dedupe_key);
}

/** Whether a they_owe item is overdue enough to surface as "follow-up worth sending". */
export function isOverdue(f: { due_at: string | null; status: string }, now: Date) {
  return f.status === "open" && !!f.due_at && new Date(f.due_at) < now;
}
