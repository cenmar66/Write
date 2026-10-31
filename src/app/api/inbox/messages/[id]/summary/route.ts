import { aiSummarizeThread } from "@/lib/inbox/ai/features";
import { handle, HttpError, loadPrefs, rateLimit, requireWorkspace } from "@/lib/inbox/server/workspace";
import type { AccountRow, MessageRow } from "@/lib/inbox/types";

/** AI summary of a conversation, limited to the content level the user allowed. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    rateLimit(`ai:${ctx.userId}`, 30);
    const { data: m } = await ctx.db.from("ip_messages").select("*").eq("id", (await params).id).maybeSingle();
    if (!m) throw new HttpError(404, "Message not found.");
    await requireWorkspace(ctx, m.workspace_id);
    const prefs = await loadPrefs(ctx);
    const { data: acc } = await ctx.db.from("ip_accounts").select("*").eq("id", m.account_id).single();
    const mode = (acc as AccountRow).settings?.ai_content ?? prefs.ai_content;
    const { data: thread } = m.thread_id ? await ctx.db.from("ip_messages").select("*").eq("thread_id", m.thread_id).order("received_at").limit(12) : { data: [m] };
    const res = await aiSummarizeThread({ db: ctx.db, userId: ctx.userId, workspaceId: m.workspace_id, prefs }, (thread ?? [m]) as MessageRow[], mode);
    if (!res.ok) return Response.json({ error: res.reason }, { status: 409 });
    return { ...res.data, model: res.model, content_level: mode };
  });
}
