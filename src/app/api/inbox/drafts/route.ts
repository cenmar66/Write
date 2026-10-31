import { aiDraft, DRAFT_ACTIONS } from "@/lib/inbox/ai/features";
import { audit, body, handle, HttpError, isUuid, loadPrefs, rateLimit, requireAccount, requireWorkspace } from "@/lib/inbox/server/workspace";
import type { AccountRow, Address, MessageRow } from "@/lib/inbox/types";

/**
 * Create a draft. With message_id it's a reply in that conversation, from the account
 * that received it. With an AI action it's generated (AI never sends: drafts only).
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    rateLimit(`draft:${ctx.userId}`, 30);
    const b = await body<{ message_id?: string; account_id?: string; action?: keyof typeof DRAFT_ACTIONS | "blank"; instructions?: string; language?: string; to?: Address[]; subject?: string }>(request);
    const prefs = await loadPrefs(ctx);
    let acc: AccountRow;
    let m: MessageRow | null = null;
    if (isUuid(b.message_id)) {
      const { data } = await ctx.db.from("ip_messages").select("*").eq("id", b.message_id).maybeSingle();
      if (!data) throw new HttpError(404, "Message not found.");
      await requireWorkspace(ctx, data.workspace_id);
      m = data as MessageRow;
      acc = await requireAccount(ctx, m.account_id); // replies always come from the receiving account
    } else acc = await requireAccount(ctx, b.account_id);
    if (!prefs.ai_drafts && b.action && b.action !== "blank") throw new HttpError(403, "AI drafting is turned off in Settings.");

    const language = ["en", "es"].includes(b.language ?? "") ? b.language! : prefs.writing_profile.language ?? "en";
    const replyTo: Address[] = m ? (m.is_sent ? m.to_addrs : [{ email: (m.reply_to?.match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? m.from_email).toLowerCase(), name: m.from_name }]) : (b.to ?? []);
    const subject = m ? (/^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`) : String(b.subject ?? "");
    let text = "";
    let notes = "";
    let aiGenerated = false;
    if (b.action && b.action !== "blank") {
      if (!(b.action in DRAFT_ACTIONS)) throw new HttpError(400, "Unknown draft action.");
      const { data: thread } = m?.thread_id ? await ctx.db.from("ip_messages").select("*").eq("thread_id", m.thread_id).order("received_at").limit(8) : { data: m ? [m] : [] };
      let samples: string[] = [];
      if (prefs.learn_from_sent) {
        const { data: sent } = await ctx.db.from("ip_messages").select("body_text").eq("account_id", acc.id).eq("is_sent", true).not("body_text", "is", null).order("received_at", { ascending: false }).limit(3);
        samples = (sent ?? []).map((s) => String(s.body_text).slice(0, 800));
      }
      const res = await aiDraft({ db: ctx.db, userId: ctx.userId, workspaceId: acc.workspace_id, prefs }, {
        action: b.action, thread: (thread ?? []) as MessageRow[], mode: acc.settings?.ai_content ?? prefs.ai_content, profile: prefs.writing_profile, language, userName: prefs.writing_profile.signature?.split("\n")[0] ?? "", instructions: b.instructions, samples,
      });
      if (!res.ok) return Response.json({ error: res.reason }, { status: 409 });
      text = res.data.body;
      notes = res.data.notes;
      aiGenerated = true;
    }
    const { data, error } = await ctx.db.from("ip_drafts").insert({
      workspace_id: acc.workspace_id, account_id: acc.id, message_id: m?.id ?? null, provider_thread_id: m?.provider_thread_id ?? null,
      to_addrs: replyTo, cc_addrs: [], bcc_addrs: [], subject: subject.slice(0, 300), body: text, language, ai_generated: aiGenerated,
    }).select().single();
    if (error) throw new HttpError(500, error.message);
    await audit(ctx.db, acc.workspace_id, aiGenerated ? "ai" : "user", "draft.create", data.id, { action: b.action ?? "blank" });
    return { draft: data, notes };
  });
}
