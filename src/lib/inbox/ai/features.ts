// The AI features. Each one: builds a prompt with fenced, permission-limited email
// excerpts, asks for strict JSON, then validates every field against allow-lists.
// References to messages the model wasn't shown are discarded.

import { clampText, fence, keepKnownRefs, messageExcerpt, oneOf, UNTRUSTED_RULES, detectInjection } from "../safety";
import { ACTIONS, IMPORTANCE, MSG_TYPES, TIME_SENS, type AiContentMode, type Classification, type MessageRow, type WritingProfile } from "../types";
import { aiJson, type AiCtx, type AiResult } from "./client";

const URGENCY = ["immediate", "today", "this_week", "flexible", "unknown"];
const lessUrgent = <T extends string>(ai: T, rules: T): T => (URGENCY.indexOf(ai) >= URGENCY.indexOf(rules) ? ai : rules);

type Excerptable = Parameters<typeof messageExcerpt>[0];
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: "string" };
const refList = { type: "array", items: str };
const refItems = { type: "array", items: obj({ text: str, refs: refList }) };

// ------------------------------------------------------------------ classification
export async function aiClassify(
  ctx: AiCtx,
  m: Excerptable,
  mode: AiContentMode,
  heuristic: Classification,
  locked: { importance?: boolean; msg_type?: boolean; category?: boolean },
): Promise<Classification | null> {
  const schema = obj({
    importance: { type: "string", enum: IMPORTANCE },
    msg_type: { type: "string", enum: MSG_TYPES },
    action: { type: "string", enum: ACTIONS },
    time_sensitivity: { type: "string", enum: TIME_SENS },
    confidence: { type: "number" },
    explanation: str,
  });
  const res = await aiJson<Record<string, unknown>>(ctx, "classify", {
    schemaName: "classification",
    schema,
    maxTokens: 600,
    system: `You triage email for a busy professional. Classify one message.
Importance: critical only for explicit, near-term consequences from a real person; marketing and automated mail are low.
Never infer urgency from emotional wording, capital letters or exclamation marks alone; time_sensitivity needs an explicit date or time in the message, otherwise "unknown" or "flexible".
explanation: one short sentence citing concrete evidence from the message.
${UNTRUSTED_RULES}`,
    user: `Rule-based guess (may be wrong): importance=${heuristic.importance}, type=${heuristic.msg_type}, action=${heuristic.action}.\n\n${messageExcerpt(m, mode, 1500)}`,
  });
  if (!res.ok) return null;
  const d = res.data;
  const merged: Classification = {
    ...heuristic,
    importance: locked.importance ? heuristic.importance : oneOf(d.importance, IMPORTANCE, heuristic.importance),
    msg_type: locked.msg_type ? heuristic.msg_type : oneOf(d.msg_type, MSG_TYPES, heuristic.msg_type),
    action: oneOf(d.action, ACTIONS, heuristic.action),
    // Urgency needs an explicit date, which the rules already looked for: the AI may only lower it.
    time_sensitivity: lessUrgent(oneOf(d.time_sensitivity, TIME_SENS, heuristic.time_sensitivity), heuristic.time_sensitivity),
    confidence: Math.max(0, Math.min(0.9, Number(d.confidence) || 0.6)),
    explanation: clampText(d.explanation, 240) || heuristic.explanation,
    source: "ai",
    model: res.model,
    factors: [...heuristic.factors, { label: "AI reviewed the message", weight: 0, source: "ai" }],
  };
  // AI may not promote to critical without the hard evidence the rules require.
  if (merged.importance === "critical" && heuristic.time_sensitivity !== "immediate" && heuristic.time_sensitivity !== "today" && heuristic.importance !== "critical") merged.importance = "high";
  const shift = { critical: 85, high: 65, normal: 45, low: 20 }[merged.importance];
  merged.priority_score = Math.round((heuristic.priority_score + shift) / 2);
  if (!locked.category && heuristic.category === "review") {
    merged.category = merged.action === "reply_needed" || merged.action === "review_needed" ? "needs_attention" : merged.action === "task_required" ? "todo" : merged.importance === "low" ? "low_priority" : "read_later";
  }
  return merged;
}

// ------------------------------------------------------------------ summaries
export interface Grounded {
  text: string;
  refs: string[];
}

export async function aiSummarizeThread(ctx: AiCtx, msgs: Excerptable[], mode: AiContentMode): Promise<AiResult<{ bullets: Grounded[]; next_steps: Grounded[] }>> {
  const known = new Set(msgs.map((m) => m.id));
  const res = await aiJson<{ bullets: Grounded[]; next_steps: Grounded[] }>(ctx, "summarize", {
    schemaName: "summary",
    schema: obj({ bullets: refItems, next_steps: refItems }),
    maxTokens: 900,
    system: `Summarize an email conversation in 2-5 short bullets, then up to 3 suggested next steps for the user.
Every bullet must list the ref ids of the messages that support it. Mark anything inferred with "(inferred)". Write in the language of the messages.
${UNTRUSTED_RULES}`,
    user: msgs.map((m) => messageExcerpt(m, mode, 1800)).join("\n\n"),
  });
  if (!res.ok) return res;
  return { ...res, data: { bullets: keepKnownRefs(res.data.bullets ?? [], known).slice(0, 6), next_steps: keepKnownRefs(res.data.next_steps ?? [], known).slice(0, 3) } };
}

// ------------------------------------------------------------------ drafting
export const DRAFT_ACTIONS = {
  reply: "Draft a reply",
  decline: "Decline politely",
  clarify: "Ask for clarification",
  follow_up: "Follow up on an unanswered message",
  next_steps: "Propose next steps",
} as const;
export const REWRITE_ACTIONS = {
  shorten: "Make it shorter",
  expand: "Expand it with more detail",
  professional: "Make it more professional",
  friendlier: "Make it friendlier",
  direct: "Make it more direct",
  translate_en: "Translate to English",
  translate_es: "Translate to Spanish",
} as const;

function profileText(p: WritingProfile, language: string) {
  return [
    `Language: ${language === "es" ? "Spanish" : language === "en" ? "English" : language}`,
    p.tone && `Tone: ${p.tone}`,
    p.formality && `Formality: ${p.formality}`,
    p.conciseness && `Length: ${p.conciseness}`,
    p.greeting && `Typical greeting: ${p.greeting}`,
    p.closing && `Preferred closing: ${p.closing}`,
    p.signature && `Signature: ${p.signature}`,
    p.instructions && `User's standing instructions: ${p.instructions.slice(0, 800)}`,
  ].filter(Boolean).join("\n");
}

export async function aiDraft(
  ctx: AiCtx,
  input: { action: keyof typeof DRAFT_ACTIONS; thread: Excerptable[]; mode: AiContentMode; profile: WritingProfile; language: string; userName: string; instructions?: string; samples?: string[] },
): Promise<AiResult<{ subject: string; body: string; notes: string }>> {
  const res = await aiJson<{ subject: string; body: string; notes: string }>(ctx, "draft", {
    schemaName: "draft",
    schema: obj({ subject: str, body: str, notes: str }),
    maxTokens: 1500,
    system: `You write email drafts for ${input.userName || "the user"}. Task: ${DRAFT_ACTIONS[input.action]}.
Write only the email body (no subject line inside it). Plain text, no markdown. Don't promise dates, prices or commitments the user hasn't stated; use [placeholders] for anything you don't know.
The user will review and edit before anything is sent. notes: one short line about assumptions or placeholders.
Writing profile:
${profileText(input.profile, input.language)}
${UNTRUSTED_RULES}`,
    user: [
      ...input.thread.map((m) => messageExcerpt(m, input.mode, 2500)),
      ...(input.samples?.length ? [`Examples of how the user writes (style only, not content):\n${input.samples.map((s) => fence("sample", s, 800)).join("\n")}`] : []),
      input.instructions ? `User's instructions for this draft: ${input.instructions.slice(0, 600)}` : "",
    ].join("\n\n"),
  });
  if (!res.ok) return res;
  return { ...res, data: { subject: clampText(res.data.subject, 200), body: clampText(res.data.body, 8000), notes: clampText(res.data.notes, 300) } };
}

export async function aiRewrite(ctx: AiCtx, input: { action: keyof typeof REWRITE_ACTIONS; draft: string; profile: WritingProfile; language: string }): Promise<AiResult<{ body: string; notes: string }>> {
  const res = await aiJson<{ body: string; notes: string }>(ctx, "draft", {
    schemaName: "rewrite",
    schema: obj({ body: str, notes: str }),
    maxTokens: 1500,
    system: `Rewrite the user's email draft. Task: ${REWRITE_ACTIONS[input.action]}. Keep facts, names, numbers and placeholders exactly; don't add commitments. Plain text.
Writing profile:
${profileText(input.profile, input.action === "translate_es" ? "es" : input.action === "translate_en" ? "en" : input.language)}`,
    user: `draft: ${input.draft.slice(0, 8000)}`,
  });
  if (!res.ok) return res;
  return { ...res, data: { body: clampText(res.data.body, 8000), notes: clampText(res.data.notes, 300) } };
}

// ------------------------------------------------------------------ tasks
export async function aiSuggestTask(ctx: AiCtx, m: Excerptable, mode: AiContentMode): Promise<AiResult<{ title: string; description: string; due_date: string | null; due_explicit: boolean; priority: string }>> {
  const res = await aiJson<{ title: string; description: string; due_date: string | null; due_explicit: boolean; priority: string }>(ctx, "extract_task", {
    schemaName: "task",
    schema: obj({ title: str, description: str, due_date: { type: ["string", "null"] }, due_explicit: { type: "boolean" }, priority: { type: "string", enum: ["low", "normal", "high", "urgent"] } }),
    maxTokens: 500,
    system: `Turn one email into a single actionable task for the user. Title starts with a verb. due_date (YYYY-MM-DD) only if the message states a date; set due_explicit=true only when it's stated as a deadline; otherwise null/false.
${UNTRUSTED_RULES}`,
    user: messageExcerpt(m, mode, 2000),
  });
  if (!res.ok) return res;
  const due = typeof res.data.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(res.data.due_date) ? res.data.due_date : null;
  return { ...res, data: { title: clampText(res.data.title, 200), description: clampText(res.data.description, 1000), due_date: due, due_explicit: !!due && !!res.data.due_explicit, priority: oneOf(res.data.priority, ["low", "normal", "high", "urgent"] as const, "normal") } };
}

// ------------------------------------------------------------------ briefing + assistant
export async function aiBriefingSummary(ctx: AiCtx, items: { ref: string; line: string }[]): Promise<AiResult<{ summary: Grounded[] }>> {
  const known = new Set(items.map((i) => i.ref));
  const res = await aiJson<{ summary: Grounded[] }>(ctx, "briefing", {
    schemaName: "briefing_summary",
    schema: obj({ summary: refItems }),
    maxTokens: 800,
    system: `Write an executive summary (2-4 sentences, each a separate item) of the briefing items. Only use the items given; each sentence lists the refs it relies on. Don't add events, deadlines or people that aren't in the items.
${UNTRUSTED_RULES}`,
    user: fence("briefing_items", items.map((i) => `ref: ${i.ref}\n${i.line}`).join("\n\n"), 12_000),
  });
  if (!res.ok) return res;
  return { ...res, data: { summary: keepKnownRefs(res.data.summary ?? [], known).slice(0, 4) } };
}

export interface SearchPlan {
  keywords: string[];
  from: string | null;
  needs_reply: boolean;
  category: string | null;
  importance: string | null;
  days: number;
  sent_by_me: boolean;
}

export async function aiSearchPlan(ctx: AiCtx, question: string): Promise<AiResult<SearchPlan>> {
  return aiJson<SearchPlan>(ctx, "search", {
    schemaName: "search_plan",
    schema: obj({
      keywords: { type: "array", items: str },
      from: { type: ["string", "null"] },
      needs_reply: { type: "boolean" },
      category: { type: ["string", "null"] },
      importance: { type: ["string", "null"], enum: [...IMPORTANCE, null] },
      days: { type: "integer" },
      sent_by_me: { type: "boolean" },
    }),
    maxTokens: 300,
    system: "Turn a question about the user's email into search filters. keywords: up to 4 distinctive words. days: how far back to look (default 30, max 365). category: one of needs_attention, todo, read_later, newsletters, notifications, receipts, personal, low_priority or null.",
    user: `question: ${question.slice(0, 500)}`,
  });
}

export async function aiAnswer(ctx: AiCtx, question: string, evidence: Excerptable[], extra: string, mode: AiContentMode): Promise<AiResult<{ answer: string; refs: string[]; insufficient: boolean }>> {
  const known = new Set(evidence.map((m) => m.id));
  const res = await aiJson<{ answer: string; refs: string[]; insufficient: boolean }>(ctx, "assistant", {
    schemaName: "answer",
    schema: obj({ answer: str, refs: refList, insufficient: { type: "boolean" } }),
    maxTokens: 1200,
    system: `You answer questions about the user's email using ONLY the evidence provided. Cite the refs you used. If the evidence doesn't answer the question, say so plainly and set insufficient=true.
You cannot perform actions; if the user asks for one, say which button in the app does it.
${UNTRUSTED_RULES}`,
    user: `question: ${question.slice(0, 800)}\n\n${extra}\n\n${evidence.map((m) => messageExcerpt(m, mode, 900)).join("\n\n")}`,
  });
  if (!res.ok) return res;
  return { ...res, data: { answer: clampText(res.data.answer, 3000), refs: (res.data.refs ?? []).filter((r) => known.has(r)).slice(0, 10), insufficient: !!res.data.insufficient } };
}

export function injectionFlags(m: Pick<MessageRow, "subject" | "snippet" | "body_text">) {
  return detectInjection(`${m.subject}\n${m.snippet}\n${m.body_text ?? ""}`);
}
