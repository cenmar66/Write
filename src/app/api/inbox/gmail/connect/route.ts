import { NextResponse } from "next/server";
import { gmailAuthUrl, gmailConfigured, newOAuthState, type ScopeLevel } from "@/lib/inbox/mail/gmail";
import { entitlementFor, handle, HttpError, rateLimit, requireAccount, requireWorkspace } from "@/lib/inbox/server/workspace";

/**
 * Starts Google consent. ?workspace=<id>&level=read|modify|send[&account=<id>]
 * "read" connects a new mailbox; "modify"/"send" add permission to an existing one.
 */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    rateLimit(`gconnect:${ctx.userId}`, 10);
    if (!gmailConfigured()) throw new HttpError(503, "Gmail isn't set up on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
    if (!ctx.admin) throw new HttpError(503, "SUPABASE_SECRET_KEY is required to store mailbox tokens securely.");
    const url = new URL(request.url);
    const level = (["read", "modify", "send"].includes(url.searchParams.get("level") ?? "") ? url.searchParams.get("level") : "read") as ScopeLevel;
    const accountId = url.searchParams.get("account") ?? undefined;
    let workspaceId = url.searchParams.get("workspace");
    let hint: string | null = null;
    if (accountId) {
      const acc = await requireAccount(ctx, accountId);
      workspaceId = acc.workspace_id;
      hint = acc.email;
    }
    const ws = await requireWorkspace(ctx, workspaceId);
    if (ws.is_demo) throw new HttpError(400, "Real mailboxes can't be added to the demo workspace. Create a personal or business workspace first.");
    if (!accountId) {
      const ent = await entitlementFor(ctx.db, ws.id);
      const { count } = await ctx.db.from("ip_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
      if ((count ?? 0) >= ent.maxAccounts) throw new HttpError(402, `Your plan allows ${ent.maxAccounts} connected account(s) in this workspace.`);
    }
    const state = await newOAuthState({ workspaceId: ws.id, level, accountId });
    return NextResponse.redirect(gmailAuthUrl(url.origin, level, state, hint));
  });
}
