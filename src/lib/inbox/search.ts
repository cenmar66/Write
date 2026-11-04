// Search: a small query language (from:, to:, domain:, subject:, has:attachment, is:unread,
// after:, before:, account:, priority:, category:, status:) plus a rule-based reading of
// plain questions, used when AI is off.

export interface SearchFilters {
  text: string[];
  from?: string;
  to?: string;
  domain?: string;
  subject?: string;
  hasAttachment?: boolean;
  unread?: boolean;
  after?: string;
  before?: string;
  account?: string;
  importance?: string[];
  category?: string;
  status?: "open" | "done" | "snoozed";
  sentByMe?: boolean;
  needsReply?: boolean;
  taskStatus?: "open" | "done";
}

const IMPORTANCE_ALIASES: Record<string, string[]> = { critical: ["critical"], high: ["critical", "high"], important: ["critical", "high"], normal: ["normal"], low: ["low"] };

export function parseQuery(q: string): SearchFilters {
  const f: SearchFilters = { text: [] };
  const tokens = q.match(/(\w+:"[^"]*"|\w+:\S+|"[^"]*"|\S+)/g) ?? [];
  for (const raw of tokens) {
    const m = raw.match(/^(\w+):(.*)$/);
    if (!m) {
      const t = raw.replace(/^"|"$/g, "").trim();
      if (t) f.text.push(t.slice(0, 100));
      continue;
    }
    const key = m[1].toLowerCase();
    const val = m[2].replace(/^"|"$/g, "").trim().slice(0, 200);
    switch (key) {
      case "from": f.from = val.toLowerCase(); break;
      case "to": f.to = val.toLowerCase(); break;
      case "domain": f.domain = val.toLowerCase().replace(/^@/, ""); break;
      case "subject": f.subject = val; break;
      case "has": if (/^attach/.test(val)) f.hasAttachment = true; break;
      case "is":
        if (val === "unread") f.unread = true;
        else if (val === "sent") f.sentByMe = true;
        else if (val === "snoozed") f.status = "snoozed";
        else if (val === "done") f.status = "done";
        break;
      case "after": if (/^\d{4}-\d{2}-\d{2}$/.test(val)) f.after = val; break;
      case "before": if (/^\d{4}-\d{2}-\d{2}$/.test(val)) f.before = val; break;
      case "account": f.account = val.toLowerCase(); break;
      case "priority": case "importance": f.importance = IMPORTANCE_ALIASES[val.toLowerCase()] ?? undefined; break;
      case "category": case "in": f.category = val.toLowerCase(); break;
      case "status": if (["open", "done", "snoozed"].includes(val)) f.status = val as SearchFilters["status"]; break;
      case "task": if (val === "open" || val === "done") f.taskStatus = val; break;
      default: f.text.push(raw);
    }
  }
  return f;
}

/** Rule-based interpretation of a natural question (fallback when AI is off). */
export function interpretQuestion(question: string, now: Date): SearchFilters & { intent: "messages" | "awaiting_reply" | "i_owe" | "invoices" | "promises" } {
  const q = question.toLowerCase();
  const f: SearchFilters = { text: [] };
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  if (/last week|past week|semana pasada/.test(q)) {
    f.after = daysAgo(14);
    f.before = daysAgo(0);
  }
  else if (/today|hoy/.test(q)) f.after = daysAgo(1);
  else if (/this month|este mes/.test(q)) f.after = daysAgo(31);
  let intent: "messages" | "awaiting_reply" | "i_owe" | "invoices" | "promises" = "messages";
  if (/(i sent|did i send|envié).*(no|not|without).*(repl|respuesta)|waiting (for|on)|awaiting/.test(q)) intent = "awaiting_reply";
  else if (/(need|needs) my (response|reply)|waiting for me|respond to|owe/.test(q)) intent = "i_owe";
  else if (/invoice|factura|bill|payment/.test(q)) intent = "invoices";
  else if (/promis|commit|deliver|prometi/.test(q)) intent = "promises";
  if (/urgent|important|critical/.test(q)) f.importance = ["critical", "high"];
  const fromMatch = q.match(/from ([\w.@-]+)/);
  if (fromMatch && !["clients", "the", "a", "my"].includes(fromMatch[1])) f.from = fromMatch[1];
  if (intent === "messages") {
    const stop = new Set(["show", "me", "emails", "email", "from", "the", "that", "what", "which", "who", "is", "are", "my", "did", "a", "an", "to", "of", "in", "for", "i", "with", "about", "messages", "any", "all", "do", "have", "need", "response"]);
    f.text = q.replace(/[^\p{L}\p{N}@.\s-]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).slice(0, 4);
  }
  return { ...f, intent };
}

/** Escapes user text for PostgREST ilike patterns. */
export const likeEscape = (s: string) => s.replace(/[%_\\,()]/g, (c) => `\\${c}`);
