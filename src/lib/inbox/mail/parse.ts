// Turns raw provider data (Gmail API message resources, RFC 5322 headers) into a
// NormalizedMessage. Pure functions: no network, easy to test.

import type { Address, Attachment, NormalizedMessage, Signals } from "../types";

export interface GmailHeader {
  name: string;
  value: string;
}
export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
}

/** Splits an address list on commas that are outside quotes and angle brackets. */
export function parseAddressList(raw: string | null | undefined): Address[] {
  if (!raw) return [];
  const out: Address[] = [];
  let cur = "";
  let quoted = false;
  let angle = 0;
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "<") angle++;
    if (!quoted && ch === ">") angle = Math.max(0, angle - 1);
    if (ch === "," && !quoted && angle === 0) {
      const a = parseAddress(cur);
      if (a) out.push(a);
      cur = "";
    } else cur += ch;
  }
  const last = parseAddress(cur);
  if (last) out.push(last);
  return out;
}

export function parseAddress(raw: string): Address | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (m) {
    const name = decodeMimeWords(m[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim());
    return { email: m[2].toLowerCase(), name };
  }
  const bare = s.match(/[^\s<>"]+@[^\s<>"]+/);
  return bare ? { email: bare[0].toLowerCase(), name: "" } : null;
}

/** Decodes RFC 2047 encoded words (=?utf-8?B?...?= / =?utf-8?Q?...?=). */
export function decodeMimeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset: string, enc: string, text: string) => {
    try {
      const bytes =
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), "binary");
      return new TextDecoder(charset.toLowerCase() === "utf8" ? "utf-8" : charset).decode(bytes);
    } catch {
      return text;
    }
  });
}

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Very small HTML → text converter (no DOM). Drops scripts/styles and hidden content. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+style\s*=\s*"[^"]*display\s*:\s*none[^"]*"[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Removes quoted replies ("On ... wrote:" and > lines) so we keep only the new text. */
export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^On .{4,200}wrote:\s*$/i.test(line.trim()) || /^El .{4,200}escribió:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From: .+/.test(line) && out.length > 3 && /^_{5,}|^-{5,}/.test(out[out.length - 1] ?? "")) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function walkParts(part: GmailPart | undefined, visit: (p: GmailPart) => void) {
  if (!part) return;
  visit(part);
  for (const p of part.parts ?? []) walkParts(p, visit);
}

/** Picks the best text body: text/plain first, else converted text/html. */
export function extractBody(payload: GmailPart | undefined): { text: string | null; attachments: Attachment[]; calendar: boolean } {
  let plain: string | null = null;
  let html: string | null = null;
  let calendar = false;
  const attachments: Attachment[] = [];
  walkParts(payload, (p) => {
    const mime = (p.mimeType ?? "").toLowerCase();
    if (mime === "text/calendar") calendar = true;
    if (p.filename) {
      attachments.push({ filename: p.filename, mimeType: p.mimeType ?? "application/octet-stream", size: p.body?.size ?? 0 });
      return;
    }
    if (!p.body?.data) return;
    if (mime === "text/plain" && plain === null) plain = decodeBase64Url(p.body.data);
    else if (mime === "text/html" && html === null) html = decodeBase64Url(p.body.data);
  });
  const text = plain ?? (html !== null ? htmlToText(html) : null);
  return { text, attachments, calendar };
}

export function headerMap(headers: GmailHeader[] | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const h of headers ?? []) {
    const k = h.name.toLowerCase();
    if (!m.has(k)) m.set(k, h.value);
  }
  return m;
}

export const domainOf = (email: string) => (email.split("@")[1] ?? "").toLowerCase();

const NOREPLY = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|alerts?|mailer|bounce[s]?|info|news(letter)?|updates?|hello|marketing|support)([+-].*)?@/i;
const AUTO_SUBJECT = /^(auto(matic)?[ -]?reply|out of (the )?office|autorespuesta|respuesta autom[aá]tica|fuera de la oficina|abwesenheit)\b/i;
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com"]);
const BRANDS = ["paypal", "apple", "microsoft", "google", "amazon", "netflix", "bank", "chase", "wells fargo", "irs", "docusign", "stripe", "coinbase"];

export function computeSignals(input: {
  from: Address;
  replyTo: string | null;
  subject: string;
  headers: Map<string, string>;
  labelIds: string[];
  calendar: boolean;
}): Signals {
  const { from, headers, labelIds } = input;
  const s: Signals = {};
  const precedence = (headers.get("precedence") ?? "").toLowerCase();
  if (["bulk", "list", "junk"].includes(precedence) || headers.has("list-id") || headers.has("list-unsubscribe")) s.bulk = true;
  if (NOREPLY.test(from.email)) s.noreply = true;
  const autoSub = (headers.get("auto-submitted") ?? "").toLowerCase();
  if ((autoSub && autoSub !== "no") || headers.has("x-autoreply") || headers.has("x-autorespond") || AUTO_SUBJECT.test(input.subject.trim())) s.autoReply = true;
  const ctype = (headers.get("content-type") ?? "").toLowerCase();
  if (/^(mailer-daemon|postmaster)@/i.test(from.email) || ctype.includes("multipart/report") || /^(delivery status notification|undeliverable|mail delivery failed)/i.test(input.subject)) s.dsn = true;
  if (input.calendar) s.calendar = true;
  if (labelIds.includes("SPAM")) s.spamLabel = true;
  const cat = labelIds.find((l) => l.startsWith("CATEGORY_") && l !== "CATEGORY_PERSONAL");
  if (cat) s.gmailCategory = cat.replace("CATEGORY_", "").toLowerCase();

  const warnings: string[] = [];
  const fromDomain = domainOf(from.email);
  const nameEmail = from.name.match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase();
  if (nameEmail && domainOf(nameEmail) !== fromDomain) warnings.push(`Display name shows ${nameEmail} but the message came from ${from.email}.`);
  if (input.replyTo) {
    const rt = parseAddress(input.replyTo);
    if (rt && domainOf(rt.email) !== fromDomain && !s.bulk) warnings.push(`Replies would go to ${rt.email}, a different domain than the sender.`);
  }
  const lname = from.name.toLowerCase();
  const brand = BRANDS.find((b) => lname.includes(b));
  if (brand && FREE_MAIL.has(fromDomain)) warnings.push(`Uses the name "${from.name}" but was sent from a personal ${fromDomain} address.`);
  const auth = (headers.get("authentication-results") ?? "").toLowerCase();
  if (/dmarc=fail/.test(auth)) warnings.push("The sender's domain failed DMARC authentication.");
  if (warnings.length) s.suspicious = warnings;
  return s;
}

/** Normalizes a Gmail API message (format=full or metadata). */
export function normalizeGmail(msg: GmailMessage, accountEmail: string): NormalizedMessage {
  const headers = headerMap(msg.payload?.headers);
  const from = parseAddress(headers.get("from") ?? "") ?? { email: "", name: "" };
  from.name = decodeMimeWords(from.name);
  const labelIds = msg.labelIds ?? [];
  const { text, attachments, calendar } = extractBody(msg.payload);
  const subject = decodeMimeWords(headers.get("subject") ?? "").trim();
  const replyTo = headers.get("reply-to") ?? null;
  const internal = Number(msg.internalDate);
  const dateHeader = Date.parse(headers.get("date") ?? "");
  const receivedAt = new Date(Number.isFinite(internal) && internal > 0 ? internal : Number.isFinite(dateHeader) ? dateHeader : Date.now()).toISOString();
  const me = accountEmail.toLowerCase();
  return {
    providerMessageId: msg.id,
    providerThreadId: msg.threadId,
    rfcMessageId: headers.get("message-id") ?? null,
    inReplyTo: headers.get("in-reply-to") ?? null,
    from,
    to: parseAddressList(headers.get("to")),
    cc: parseAddressList(headers.get("cc")),
    replyTo,
    subject,
    snippet: decodeEntities(msg.snippet ?? ""),
    bodyText: text,
    receivedAt,
    labelIds,
    isUnread: labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    isSent: labelIds.includes("SENT") || from.email === me,
    inInbox: labelIds.includes("INBOX"),
    attachments,
    listId: headers.get("list-id") ?? null,
    listUnsubscribe: headers.get("list-unsubscribe") ?? null,
    autoSubmitted: headers.get("auto-submitted") ?? null,
    precedence: headers.get("precedence") ?? null,
    signals: computeSignals({ from, replyTo, subject, headers, labelIds, calendar }),
  };
}

function decodeEntities(s: string) {
  return s.replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m));
}

/** Builds an RFC 5322 message for sending, base64url-encoded as Gmail expects. */
export function buildRawEmail(m: {
  from: string;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
}): string {
  const fmt = (list: Address[]) => list.map((a) => (a.name ? `${encodeWord(a.name)} <${a.email}>` : a.email)).join(", ");
  const lines = [
    `From: ${m.from}`,
    `To: ${fmt(m.to)}`,
    ...(m.cc.length ? [`Cc: ${fmt(m.cc)}`] : []),
    ...(m.bcc.length ? [`Bcc: ${fmt(m.bcc)}`] : []),
    `Subject: ${encodeWord(m.subject)}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.references ?? m.inReplyTo}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(m.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function encodeWord(s: string) {
  // Header injection guard: no CR/LF ever reaches a header.
  const clean = s.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

export function isValidEmail(e: string) {
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i.test(e);
}
