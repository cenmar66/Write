import { aiSuggestTask } from "@/lib/inbox/ai/features";
import { body, handle, HttpError, loadPrefs, rateLimit, requireWorkspace } from "@/lib/inbox/server/workspace";
import { suggestTask } from "@/lib/inbox/tasks";
import type { AccountRow, ClassificationRow, MessageRow } from "@/lib/inbox/types";

/** Suggested task fields for an email. Nothing is created until the user confirms. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    rateLimit(`ai:${ctx.userId}`, 30);
    const b = await body<{ message_id?: string; use_ai?: boolean }>(request);
    const { data: m } = await ctx.db.from("ip_messages").select("*").eq("id", b.message_id ?? "").maybeSingle();
    if (!m) throw new HttpError(404, "Message not found.");
    await requireWorkspace(ctx, m.workspace_id);
    const { data: c } = await ctx.db.from("ip_classifications").select("*").eq("message_id", m.id).maybeSingle();
    const s = suggestTask(m as MessageRow, c as ClassificationRow | null);
    let ai: { used: boolean; note?: string } = { used: false };
    if (b.use_ai !== false) {
      const prefs = await loadPrefs(ctx);
      const { data: acc } = await ctx.db.from("ip_accounts").select("settings").eq("id", m.account_id).single();
      const res = await aiSuggestTask({ db: ctx.db, userId: ctx.userId, workspaceId: m.workspace_id, prefs }, m as MessageRow, (acc as AccountRow).settings?.ai_content ?? prefs.ai_content);
      if (res.ok) {
        s.title = res.data.title || s.title;
        if (res.data.description) s.description = `${res.data.description}\n\n${s.description}`;
        // The rules' explicit deadline wins; an AI date is kept only if labelled explicit by the model AND none was found.
        if (!s.due_date && res.data.due_date) {
          s.due_date = res.data.due_date;
          s.provenance.due_date = res.data.due_explicit ? "explicit" : "inferred";
        }
        ai = { used: true };
      } else ai = { used: false, note: res.reason };
    }
    return { suggestion: s, ai };
  });
}
