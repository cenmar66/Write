import { aiAnswer, aiSearchPlan, type SearchPlan } from "@/lib/inbox/ai/features";
import { enrich, scopeWorkspaces } from "@/lib/inbox/server/queries";
import { audit, body, handle, HttpError, loadPrefs, rateLimit } from "@/lib/inbox/server/workspace";
import { interpretQuestion } from "@/lib/inbox/search";
import type { MessageRow } from "@/lib/inbox/types";

/**
 * Conversational assistant. Read-only: it finds evidence in your accessible mail,
 * tasks and follow-ups and answers with sources. It can propose actions as links to
 * the screens that perform them, but it never performs actions itself.
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    rateLimit(`assistant:${ctx.userId}`, 20);
    const b = await body<{ question?: string; ws?: string }>(request);
    const question = String(b.question ?? "").trim().slice(0, 800);
    if (!question) throw new HttpError(400, "Ask a question.");
    const prefs = await loadPrefs(ctx);
    const wsIds = await scopeWorkspaces(ctx, b.ws ?? "all");
    const now = new Date();
    const aiCtx = { db: ctx.db, userId: ctx.userId, workspaceId: wsIds[0] ?? null, prefs };

    // 1. Turn the question into filters (AI if allowed, rules otherwise).
    const rule = interpretQuestion(question, now);
    let plan: SearchPlan | null = null;
    const planned = await aiSearchPlan(aiCtx, question);
    if (planned.ok) plan = planned.data;
    const days = Math.max(1, Math.min(365, plan?.days ?? 30));
    const since = rule.after ?? new Date(now.getTime() - days * 86_400_000).toISOString();

    // 2. Gather evidence from real rows only.
    const followupKinds = rule.intent === "awaiting_reply" || plan?.sent_by_me ? ["they_owe"] : rule.intent === "i_owe" || plan?.needs_reply ? ["i_owe"] : rule.intent === "promises" ? ["commitment", "they_owe"] : [];
    const { data: fus } = followupKinds.length && wsIds.length ? await ctx.db.from("ip_followups").select("*").in("workspace_id", wsIds).in("kind", followupKinds).eq("status", "open").limit(30) : { data: [] };
    let q = wsIds.length ? ctx.db.from("ip_messages").select("*").in("workspace_id", wsIds).gte("received_at", since) : null;
    let rows: MessageRow[] = [];
    if (q) {
      const words = [...new Set([...(plan?.keywords ?? []), ...rule.text, ...(rule.intent === "invoices" ? ["invoice", "factura", "payment"] : [])])].map((w) => w.replace(/[^\p{L}\p{N}@._-]/gu, "")).filter((w) => w.length > 2).slice(0, 5);
      const from = plan?.from ?? rule.from;
      if (from) q = q.ilike("from_email", `%${from.replace(/[^\p{L}\p{N}@._-]/gu, "")}%`);
      if (plan?.importance || rule.importance) q = q.in("importance", rule.importance ?? (plan!.importance === "high" ? ["critical", "high"] : [plan!.importance!]));
      if (plan?.category) q = q.eq("category", plan.category);
      if (plan?.sent_by_me || rule.sentByMe) q = q.eq("is_sent", true);
      if (words.length) q = q.or(words.flatMap((w) => [`subject.ilike.%${w}%`, `snippet.ilike.%${w}%`]).join(","));
      const fuIds = (fus ?? []).map((f) => f.message_id).filter(Boolean);
      const [{ data: hits }, { data: fuMsgs }] = await Promise.all([
        followupKinds.length && !words.length ? Promise.resolve({ data: [] }) : q.order("priority_score", { ascending: false }).order("received_at", { ascending: false }).limit(15),
        fuIds.length ? ctx.db.from("ip_messages").select("*").in("id", fuIds) : Promise.resolve({ data: [] }),
      ]);
      const seen = new Set<string>();
      rows = [...((fuMsgs ?? []) as MessageRow[]), ...((hits ?? []) as MessageRow[])].filter((m) => !seen.has(m.id) && seen.add(m.id)).slice(0, 15);
    }
    const fuLines = (fus ?? []).map((f) => `- [${f.kind}] ${f.title}${f.due_at ? ` (due ${String(f.due_at).slice(0, 10)}${f.due_explicit ? "" : ", inferred"})` : ""} ref: ${f.message_id ?? "none"}`).join("\n");

    // 3. Answer, grounded. Without AI, return the evidence list itself.
    const res = rows.length || fuLines ? await aiAnswer(aiCtx, question, rows, fuLines ? `Tracked follow-ups:\n${fuLines}` : "", prefs.ai_content) : null;
    const sources = await enrich(ctx.db, rows);
    const proposals = [
      ...(rule.intent === "i_owe" || /draft|respond|reply/i.test(question) ? [{ label: "Open the messages and use “Draft reply” (you review before anything is sent)", href: "/inbox/followups?tab=i_owe" }] : []),
      ...(rule.intent === "awaiting_reply" ? [{ label: "See everything you're waiting on", href: "/inbox/followups?tab=they_owe" }] : []),
    ];
    await audit(ctx.db, wsIds[0] ?? null, "assistant", "assistant.ask", null, { evidence: rows.length, ai: !!res?.ok });
    if (res?.ok) {
      const used = new Set(res.data.refs);
      return { answer: res.data.answer, insufficient: res.data.insufficient, sources: sources.filter((s) => used.has(s.id)), related: sources.filter((s) => !used.has(s.id)).slice(0, 5), followups: fus ?? [], proposals, ai: true };
    }
    return {
      answer: rows.length || (fus ?? []).length ? `Here's what I found in your mail (${rows.length} message${rows.length === 1 ? "" : "s"}${(fus ?? []).length ? `, ${(fus ?? []).length} tracked item${(fus ?? []).length === 1 ? "" : "s"}` : ""}).` : "I couldn't find anything in your accessible mail that answers this.",
      insufficient: !rows.length && !(fus ?? []).length,
      sources,
      related: [],
      followups: fus ?? [],
      proposals,
      ai: false,
      ai_note: res && !res.ok ? res.reason : planned.ok ? undefined : planned.reason,
    };
  });
}
