// Deterministic, explainable classification. Runs on every message for free; the
// optional AI pass (ai/classify.ts) only looks at what this leaves uncertain, and it
// can never override user feedback, sender settings or explicit rules.

import { findDates } from "./deadlines";
import { domainOf, stripQuoted } from "./mail/parse";
import type { ActionKind, Classification, Factor, Importance, MessageRow, MsgType, SenderRow, TimeSensitivity } from "./types";

export interface SenderFeedback {
  importance?: Importance;
  msg_type?: MsgType;
  action?: ActionKind;
  category?: string;
}

export interface ClassifyContext {
  me: Set<string>;                 // this account's addresses
  sender: Pick<SenderRow, "is_vip" | "always_priority" | "screening" | "default_category" | "blocked" | "received_count" | "replied_count" | "sent_to_count"> | null;
  feedback: SenderFeedback;        // latest corrections the user made for this sender (this workspace only)
  iParticipated: boolean;          // I've written in this thread
  workspaceKind: "personal" | "business" | "team";
  now: Date;
  weights?: Partial<PriorityWeights>;
}

export interface PriorityWeights {
  base: number;
  vip: number;
  alwaysPriority: number;
  knownCorrespondent: number;
  iEmailedThem: number;
  myThread: number;
  directTo: number;
  ccOnly: number;
  replyNeeded: number;
  taskOrReview: number;
  deadlineToday: number;
  deadlineWeek: number;
  bulk: number;
  noreply: number;
  marketing: number;
  newsletter: number;
  notification: number;
  autoOrBounce: number;
  screenedOut: number;
  spam: number;
}

export const DEFAULT_WEIGHTS: PriorityWeights = {
  base: 35,
  vip: 35,
  alwaysPriority: 30,
  knownCorrespondent: 12,
  iEmailedThem: 8,
  myThread: 12,
  directTo: 5,
  ccOnly: -6,
  replyNeeded: 12,
  taskOrReview: 9,
  deadlineToday: 18,
  deadlineWeek: 8,
  bulk: -18,
  noreply: -14,
  marketing: -22,
  newsletter: -14,
  notification: -10,
  autoOrBounce: -25,
  screenedOut: -30,
  spam: -40,
};

type Msg = Pick<
  MessageRow,
  "from_email" | "from_name" | "to_addrs" | "cc_addrs" | "subject" | "snippet" | "body_text" | "received_at" | "is_sent" | "has_attachments" | "attachments" | "list_id" | "list_unsubscribe" | "signals" | "label_ids"
>;

const RX = {
  invoice: /\b(invoice|factura|bill(ing)? statement|payment (due|request|reminder)|amount due|remittance|past due)\b/i,
  receipt: /\b(receipt|recibo|order (confirmation|#|number)|your order|has shipped|shipping confirmation|payment (received|confirmation)|thank you for your (order|purchase|payment)|subscription (renewed|confirmation))\b/i,
  security: /\b(security alert|verification code|sign[- ]in attempt|new (sign[- ]in|login)|password (reset|changed)|2fa|one[- ]time (code|password)|código de verificación)\b/i,
  newsletter: /\b(newsletter|digest|weekly|this week in|edition|issue #?\d+|roundup|boletín)\b/i,
  marketing: /\b(\d+% off|sale|discount|deal|promo(tion)?|offer|limited time|free shipping|shop now|exclusive|coupon|oferta|descuento|rebajas)\b/i,
  prospect: /\b(interested in (your|working)|request(ing)? a (quote|proposal)|pricing|could we (schedule|set up) a call|partnership opportunity|introduc(e|tion)|cotización|propuesta)\b/i,
  vendor: /\b(quote|estimate|proposal attached|our services|contract renewal|purchase order|PO #)\b/i,
  admin: /\b(meeting|invitation|calendar|schedule|agenda|reunión|policy|HR|benefits|payroll|tax|IRS|permit)\b/i,
  reply: /(\?|¿)|\b(can you|could you|would you|will you|please (reply|respond|confirm|let me know|advise|send)|let me know|your thoughts|are you available|do you have|any update|puedes|podrías|me confirmas)\b/i,
  review: /\b((please|could you|can you|would you)\s+(review|take a look|look over|approve|sign)|for your (review|approval|signature)|needs your (approval|signature|review)|feedback on|revisar|aprobar|firmar)\b/i,
  task: /\b(action required|need you to|please (send|prepare|complete|submit|update|fill)|to[- ]do|by (end of|eod|close of)|tarea|necesito que)\b/i,
  statedUrgency: /\b(urgent|asap|as soon as possible|immediately|right away|time[- ]sensitive|urgente|cuanto antes)\b/i,
};

const scoreToImportance = (s: number): Importance => (s >= 80 ? "critical" : s >= 60 ? "high" : s >= 35 ? "normal" : "low");

/** Category keys used by the built-in virtual folders. */
export const SYSTEM_CATEGORIES = [
  { key: "needs_attention", name: "Needs My Attention", icon: "alert-circle" },
  { key: "todo", name: "To Do", icon: "check-square" },
  { key: "read_later", name: "Read Later", icon: "bookmark" },
  { key: "newsletters", name: "Newsletters", icon: "newspaper" },
  { key: "notifications", name: "Notifications", icon: "bell" },
  { key: "receipts", name: "Receipts & Documents", icon: "receipt" },
  { key: "personal", name: "Personal", icon: "heart" },
  { key: "low_priority", name: "Low Priority", icon: "arrow-down" },
  { key: "review", name: "Review: Uncertain", icon: "help-circle" },
] as const;

export function classifyMessage(m: Msg, ctx: ClassifyContext): Classification {
  const w = { ...DEFAULT_WEIGHTS, ...(ctx.weights ?? {}) };
  const s = m.signals ?? {};
  const factors: Factor[] = [];
  const add = (label: string, weight: number, source: Factor["source"]) => {
    factors.push({ label, weight, source });
  };
  const body = stripQuoted(m.body_text ?? "");
  const text = `${m.subject}\n${m.snippet}\n${body}`.slice(0, 6000);
  const fromDomain = domainOf(m.from_email);
  const myDomains = new Set([...ctx.me].map(domainOf));
  const freeMail = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|proton|protonmail)\./.test(fromDomain);
  const sender = ctx.sender;
  let certainty = 0.5; // how decisive the evidence is

  // ---- type
  let type: MsgType = "other";
  if (s.dsn || s.autoReply) type = "notification";
  else if (RX.security.test(text)) type = "notification";
  else if (RX.receipt.test(text) && (s.bulk || s.noreply)) type = "transactional";
  else if (RX.invoice.test(text)) type = s.bulk || s.noreply ? "transactional" : "financial";
  else if (s.gmailCategory === "promotions" || (s.bulk && RX.marketing.test(text))) type = "marketing";
  else if (s.bulk && (m.list_id || RX.newsletter.test(text) || s.gmailCategory === "updates" || s.gmailCategory === "forums")) type = "newsletter";
  else if (s.bulk) type = "marketing";
  else if (s.noreply) type = "notification";
  else if (s.calendar) type = "administrative";
  else if (!freeMail && myDomains.has(fromDomain) && ctx.workspaceKind !== "personal") type = "team";
  else if (RX.prospect.test(text) && (sender?.received_count ?? 0) <= 1) type = "prospect";
  else if (RX.vendor.test(text)) type = "vendor";
  else if ((sender?.replied_count ?? 0) > 0 && ctx.workspaceKind !== "personal") type = "client";
  else if (RX.admin.test(text)) type = "administrative";
  if (type !== "other") certainty = s.bulk || s.noreply || s.dsn || s.autoReply ? 0.9 : 0.7;
  if (ctx.feedback.msg_type) {
    type = ctx.feedback.msg_type;
    certainty = 0.95;
    add(`You marked this sender as ${type}`, 0, "feedback");
  }
  const human = !["newsletter", "marketing", "notification", "transactional"].includes(type);

  // ---- action
  let action: ActionKind = "informational";
  if (m.is_sent) action = RX.reply.test(text) ? "waiting" : "no_action";
  else if (!human) action = type === "marketing" ? "no_action" : "informational";
  else if (RX.review.test(text)) action = "review_needed";
  else if (RX.task.test(text)) action = "task_required";
  else if (RX.reply.test(`${m.subject}\n${body || m.snippet}`)) action = "reply_needed";
  if (ctx.feedback.action) action = ctx.feedback.action;

  // ---- time sensitivity (explicit dates only; emotional language is never enough)
  let time: TimeSensitivity = human ? "flexible" : "unknown";
  const ref = new Date(m.received_at);
  const explicit = human ? findDates(text, ref).filter((d) => d.explicit) : [];
  const soonest = explicit.map((d) => new Date(d.date)).filter((d) => d.getTime() >= ctx.now.getTime() - 86_400_000).sort((a, b) => +a - +b)[0];
  if (soonest) {
    const hours = (soonest.getTime() - ctx.now.getTime()) / 3_600_000;
    const sameDay = soonest.toISOString().slice(0, 10) <= ctx.now.toISOString().slice(0, 10);
    time = hours <= 6 ? "immediate" : sameDay ? "today" : hours <= 24 * 7 ? "this_week" : "flexible";
    const ev = explicit.find((d) => +new Date(d.date) === +soonest)!;
    // A date only raises priority when it's a deadline for *you* (the message asks something of you).
    const onMe = action === "reply_needed" || action === "review_needed" || action === "task_required";
    add(onMe ? `Explicit deadline: “${ev.phrase}”` : `Mentions a date: “${ev.phrase}”`, !onMe ? 0 : time === "immediate" || time === "today" ? w.deadlineToday : time === "this_week" ? w.deadlineWeek : 0, "deadline");
    if (!onMe) time = "flexible";
  } else if (human && RX.statedUrgency.test(text) && (sender?.replied_count ?? 0) > 0) {
    // Only a known correspondent's "urgent" nudges the score, and only slightly.
    add("Sender says it's urgent (no date given)", 4, "content");
  }

  // ---- priority score
  let score = w.base;
  if (sender?.is_vip) add("VIP sender", w.vip, "vip");
  if (sender?.always_priority) add("You always prioritize this sender", w.alwaysPriority, "sender");
  if ((sender?.replied_count ?? 0) > 0) add(`You've replied to this sender ${sender!.replied_count}×`, w.knownCorrespondent, "sender");
  else if ((sender?.sent_to_count ?? 0) > 0) add("You've emailed this sender before", w.iEmailedThem, "sender");
  else if (human && (sender?.received_count ?? 0) <= 1) add("First message from this sender", 0, "sender");
  if (ctx.iParticipated && !m.is_sent) add("Reply in a conversation you're part of", w.myThread, "thread");
  const toMe = (m.to_addrs ?? []).some((a) => ctx.me.has(a.email.toLowerCase()));
  const ccMe = (m.cc_addrs ?? []).some((a) => ctx.me.has(a.email.toLowerCase()));
  if (human && toMe) add("Sent directly to you", w.directTo, "headers");
  else if (human && ccMe) add("You're only on CC", w.ccOnly, "headers");
  if (action === "reply_needed") add("Asks you a question", w.replyNeeded, "content");
  if (action === "review_needed" || action === "task_required") add(action === "review_needed" ? "Asks for your review" : "Asks you to do something", w.taskOrReview, "content");
  if (s.dsn || s.autoReply) add(s.dsn ? "Bounce / delivery notice" : "Automatic reply", w.autoOrBounce, "headers");
  else if (type === "marketing") add("Marketing email", w.marketing, "headers");
  else if (type === "newsletter") add("Newsletter or mailing list", w.newsletter, "headers");
  else if (type === "notification") add(RX.security.test(text) ? "Account / security notification" : "Automated notification", RX.security.test(text) ? 0 : w.notification, "headers");
  if (s.bulk && type !== "marketing" && type !== "newsletter") add("Bulk-mail headers", w.bulk, "headers");
  if (s.noreply && type !== "notification") add("No-reply sender", w.noreply, "headers");
  if (sender?.screening === "screened_out") add("Sender screened out", w.screenedOut, "sender");
  if (s.spamLabel) add("Gmail marked it as spam", w.spam, "headers");
  score += factors.reduce((a, f) => a + f.weight, 0);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let importance = scoreToImportance(score);
  // "Critical" needs hard evidence, never just a high pile of soft signals.
  if (importance === "critical" && !(sender?.is_vip || sender?.always_priority || time === "immediate" || time === "today")) importance = "high";
  if (ctx.feedback.importance) {
    importance = ctx.feedback.importance;
    score = { critical: Math.max(score, 85), high: Math.max(Math.min(score, 79), 62), normal: Math.max(Math.min(score, 59), 40), low: Math.min(score, 30) }[importance];
    add(`You set this sender's mail to ${importance}`, 0, "feedback");
    certainty = 0.95;
  }
  if (sender?.is_vip || sender?.always_priority) certainty = Math.max(certainty, 0.9);
  if (human && type === "other" && !ctx.feedback.msg_type) certainty = Math.min(certainty, 0.5);
  if (human && ((sender?.replied_count ?? 0) > 0 || (sender?.sent_to_count ?? 0) > 0)) certainty = Math.max(certainty, 0.7);
  if (human && !m.is_sent && action !== "informational") certainty = Math.max(certainty, 0.6); // a clear ask is a decent signal

  // ---- category (virtual folder)
  let category: string;
  if (ctx.feedback.category) category = ctx.feedback.category;
  else if (sender?.default_category) category = sender.default_category;
  else if (type === "newsletter") category = "newsletters";
  else if (type === "marketing") category = "low_priority";
  else if (type === "notification") category = "notifications";
  else if (type === "transactional" || (type === "financial" && !human)) category = "receipts";
  else if (type === "family") category = "personal";
  else if (certainty < 0.55 && importance !== "critical") category = "review";
  else if (action === "task_required") category = "todo";
  else if (action === "reply_needed" || action === "review_needed" || importance === "critical" || importance === "high") category = "needs_attention";
  else if (importance === "low") category = "low_priority";
  else if (m.is_sent) category = "read_later";
  else category = "read_later";
  if (ctx.workspaceKind === "personal" && category === "read_later" && human && freeMail) category = "personal";

  const top = [...factors].filter((f) => f.weight !== 0 || f.source === "feedback").sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 3);
  const explanation = top.length ? top.map((f) => f.label).join(" · ") : human ? "A personal message with no strong signals either way." : "Automated mail.";

  return {
    importance,
    msg_type: type,
    action,
    time_sensitivity: time,
    category,
    priority_score: score,
    confidence: Math.round(certainty * 100) / 100,
    explanation,
    factors,
    source: "heuristic",
    model: null,
    injection_flag: false,
  };
}

/** Folds a user's corrections into per-sender preferences (latest correction per field wins). */
export function feedbackFor(rows: { field: string; new_value: string; created_at: string }[]): SenderFeedback {
  const out: SenderFeedback = {};
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    (out as Record<string, string>)[r.field] = r.new_value;
  }
  return out;
}
