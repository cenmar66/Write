// Safety checks before any email leaves. Sending always needs an explicit confirmation
// from the user that matches exactly what will be sent (account, recipients, subject,
// body). AI, rules, voice dictation and the assistant can't produce that confirmation.

import { createHmac } from "node:crypto";
import { isValidEmail } from "./mail/parse";
import type { Address } from "./types";

export interface Outgoing {
  account_id: string;
  from: string;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  body: string;
}

function secret() {
  return process.env.ENCRYPTION_KEY || (process.env.NODE_ENV !== "production" ? "dev-only-inboxpilot-confirm" : "");
}

/** A token the review screen shows/returns; it's only valid for this exact message. */
export function confirmationToken(o: Outgoing, draftId: string): string {
  const s = secret();
  if (!s) throw new Error("ENCRYPTION_KEY is required for sending.");
  const canon = JSON.stringify([draftId, o.account_id, o.from.toLowerCase(), o.to.map((a) => a.email.toLowerCase()), o.cc.map((a) => a.email.toLowerCase()), o.bcc.map((a) => a.email.toLowerCase()), o.subject, o.body]);
  return createHmac("sha256", s).update(canon).digest("hex").slice(0, 32);
}

export interface SendReview {
  errors: string[];
  warnings: string[];
}

export function reviewOutgoing(o: Outgoing, ctx: { replyAccountId: string | null; threadParticipants: string[]; knownContacts: Set<string> }): SendReview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const all = [...o.to, ...o.cc, ...o.bcc];
  if (!o.to.length) errors.push("Add at least one recipient.");
  if (all.length > 50) errors.push("Too many recipients (50 max).");
  for (const a of all) if (!isValidEmail(a.email)) errors.push(`“${a.email}” isn't a valid email address.`);
  if (!o.body.trim()) errors.push("The message is empty.");
  if (/[\r\n]/.test(o.subject)) errors.push("The subject can't contain line breaks.");
  if (ctx.replyAccountId && ctx.replyAccountId !== o.account_id) errors.push("This reply would be sent from a different account than the one that received the message.");
  if (o.from && all.some((a) => a.email.toLowerCase() === o.from.toLowerCase())) warnings.push("You're sending this to yourself.");
  const participants = new Set(ctx.threadParticipants.map((e) => e.toLowerCase()));
  if (participants.size) {
    const outsiders = all.filter((a) => !participants.has(a.email.toLowerCase()));
    if (outsiders.length) warnings.push(`Not in the original conversation: ${outsiders.map((a) => a.email).join(", ")}.`);
  }
  const unknown = all.filter((a) => !ctx.knownContacts.has(a.email.toLowerCase()) && !participants.has(a.email.toLowerCase()));
  if (unknown.length) warnings.push(`You haven't emailed ${unknown.map((a) => a.email).join(", ")} before.`);
  if (/\[[^\]]{2,60}\]/.test(o.body)) warnings.push("The draft still contains [placeholders].");
  if (/\[Simulated AI/.test(o.body)) errors.push("The draft contains simulated AI text. Replace it before sending.");
  return { errors, warnings };
}
