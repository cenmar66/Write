// Black Hole: an explicit, per-sender user choice. The sender's mail is marked done and
// archived out of the mailbox inbox (never trashed, never deleted, never marked spam),
// now and on arrival, with an undo record for every archive. Only user clicks reach this
// (the sender button and the bulk "Black Hole senders" option); rules and AI can't.

import type { InboxCtx } from "../db";
import { providerFor } from "../mail/provider";
import type { AccountRow, SenderRow } from "../types";
import { blackHole } from "./process";

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/** Mail InboxSatori holds from this sender (not sent by you), up to 1,000. */
export async function senderMail(ctx: Pick<InboxCtx, "db">, s: Pick<SenderRow, "workspace_id" | "email">) {
  const { data } = await ctx.db.from("ip_messages").select("id,workspace_id,account_id,provider_message_id,in_inbox").eq("workspace_id", s.workspace_id).eq("from_email", s.email).eq("is_sent", false).limit(1000);
  return data ?? [];
}

/** Whether the workspace's mailboxes allow archiving (otherwise it's app-level only). */
export async function canArchiveIn(ctx: Pick<InboxCtx, "db">, workspaceId: string) {
  const { data: accs } = await ctx.db.from("ip_accounts").select("provider,scopes").eq("workspace_id", workspaceId);
  return (accs ?? []).some((a) => a.provider === "demo" || String(a.scopes).includes("gmail.modify"));
}

/** Sends one sender to the Black Hole: blocks future mail and clears existing mail. */
export async function blackHoleSender(ctx: Pick<InboxCtx, "db" | "admin">, s: Pick<SenderRow, "id" | "workspace_id" | "email">) {
  const rows = await senderMail(ctx, s);
  const { data: accs } = await ctx.db.from("ip_accounts").select("*").eq("workspace_id", s.workspace_id);
  let archived = 0;
  for (const acc of (accs ?? []) as AccountRow[]) {
    const p = await providerFor(acc, { admin: ctx.admin });
    // Several mailbox calls at once; each one leaves an undo record.
    await mapLimit(rows.filter((r) => r.account_id === acc.id), 8, async (m) => {
      if (await blackHole(ctx.db, p, acc, m as never)) archived++;
    });
  }
  await ctx.db.from("ip_senders").update({ blocked: true }).eq("id", s.id);
  return { affected: rows.length, archived };
}
