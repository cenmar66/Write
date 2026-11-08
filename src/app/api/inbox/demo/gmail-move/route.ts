import { demoGmailMove } from "@/lib/inbox/mail/demo";
import { body, handle, HttpError, isUuid, requireAccount } from "@/lib/inbox/server/workspace";

/**
 * Demo mailbox only: does what a user does in Gmail with "Move to" a label, so the
 * SaneBox-style labels can be tried (and tested) without a real Gmail account.
 * Real accounts are refused: InboxSatori never moves real mail through this.
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ message_id?: string; label?: string; to_inbox?: boolean }>(request);
    if (!isUuid(b.message_id)) throw new HttpError(400, "Pick a message.");
    const { data: m } = await ctx.db.from("ip_messages").select("account_id,provider_message_id").eq("id", b.message_id).maybeSingle();
    if (!m) throw new HttpError(404, "Message not found.");
    const acc = await requireAccount(ctx, m.account_id as string);
    if (acc.provider !== "demo") throw new HttpError(403, "Only the demo mailbox can be changed this way.");
    const label = String(b.label ?? "");
    if (!acc.settings?.training_labels?.[label]) throw new HttpError(400, "Not an InboxSatori label.");
    demoGmailMove(acc.id, m.provider_message_id as string, label, !!b.to_inbox);
    return { ok: true };
  });
}
