import { computeAnalytics, toCsv } from "@/lib/inbox/analytics";
import { scopeWorkspaces } from "@/lib/inbox/server/queries";
import { handle, HttpError } from "@/lib/inbox/server/workspace";
import type { ClassificationRow } from "@/lib/inbox/types";

/** GET ?ws=&range=7|30|90 or &from=YYYY-MM-DD&to=YYYY-MM-DD [&format=csv] */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const u = new URL(request.url);
    const wsIds = await scopeWorkspaces(ctx, u.searchParams.get("ws"));
    const to = u.searchParams.get("to") ? new Date(`${u.searchParams.get("to")}T23:59:59Z`) : new Date();
    const days = Math.max(1, Math.min(365, Number(u.searchParams.get("range") ?? 7) || 7));
    const from = u.searchParams.get("from") ? new Date(`${u.searchParams.get("from")}T00:00:00Z`) : new Date(to.getTime() - days * 86_400_000);
    if (Number.isNaN(+from) || Number.isNaN(+to) || from > to) throw new HttpError(400, "Invalid date range.");
    const lookback = new Date(from.getTime() - 14 * 86_400_000).toISOString(); // to measure replies to earlier mail
    const empty = { data: [] as never[] };
    const [msgs, fus, tasks, drafts, ai, fb] = wsIds.length
      ? await Promise.all([
          ctx.db.from("ip_messages").select("id,received_at,is_sent,is_unread,thread_id,from_email,done_at,account_id").in("workspace_id", wsIds).gte("received_at", lookback).lte("received_at", to.toISOString()).limit(20_000),
          ctx.db.from("ip_followups").select("kind,status,due_at,created_at").in("workspace_id", wsIds).limit(5000),
          ctx.db.from("ip_tasks").select("created_at,message_id,status").in("workspace_id", wsIds).limit(5000),
          ctx.db.from("ip_drafts").select("id", { count: "exact", head: true }).in("workspace_id", wsIds).eq("ai_generated", true).gte("created_at", from.toISOString()),
          ctx.db.from("ip_ai_usage").select("cost_usd,input_tokens,output_tokens,cached").eq("user_id", ctx.userId).gte("created_at", from.toISOString()).lte("created_at", to.toISOString()).limit(50_000),
          ctx.db.from("ip_classification_feedback").select("id", { count: "exact", head: true }).in("workspace_id", wsIds).gte("created_at", from.toISOString()),
        ])
      : [empty, empty, empty, { count: 0 }, empty, { count: 0 }];
    const ids = (msgs.data ?? []).map((m) => m.id as string);
    const cls: ClassificationRow[] = [];
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await ctx.db.from("ip_classifications").select("message_id,importance,category,msg_type,user_corrected,source").in("message_id", ids.slice(i, i + 300));
      cls.push(...((data ?? []) as ClassificationRow[]));
    }
    const cmap = new Map(cls.map((c) => [c.message_id, c]));
    const aiRows = (ai.data ?? []) as { cost_usd: number; input_tokens: number; output_tokens: number; cached: boolean }[];
    const result = computeAnalytics({
      from, to,
      messages: (msgs.data ?? []).map((m) => ({ ...(m as Record<string, unknown>), c: cmap.get(m.id as string) ?? null })) as never,
      followups: (fus.data ?? []) as never[],
      tasks: (tasks.data ?? []) as never[],
      feedbackCount: (fb as { count: number | null }).count ?? 0,
      ai: { requests: aiRows.filter((r) => !r.cached).length, cost: aiRows.reduce((a, r) => a + Number(r.cost_usd), 0), input: aiRows.reduce((a, r) => a + r.input_tokens, 0), output: aiRows.reduce((a, r) => a + r.output_tokens, 0) },
      draftsCreated: (drafts as { count: number | null }).count ?? 0,
    });
    if (u.searchParams.get("format") === "csv") {
      return new Response(toCsv(result.daily), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inboxpilot-analytics-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"` } });
    }
    return result;
  });
}
