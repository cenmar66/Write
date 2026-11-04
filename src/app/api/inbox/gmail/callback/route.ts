import { NextResponse } from "next/server";
import { consumeOAuthState, emailFromIdToken, exchangeGmailCode, saveGmailTokens } from "@/lib/inbox/mail/gmail";
import { audit, handle, requireWorkspace } from "@/lib/inbox/server/workspace";

/** Google redirects here. Verifies state, stores encrypted tokens, creates/updates the account. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(`${url.origin}/inbox/accounts?${q}`);
  return handle(async (ctx) => {
    const intent = await consumeOAuthState(url.searchParams.get("state"));
    if (!intent) return back("gmail_error=expired");
    if (url.searchParams.get("error")) return back(`gmail_error=${encodeURIComponent(url.searchParams.get("error")!.slice(0, 60))}`);
    const code = url.searchParams.get("code");
    if (!code || !ctx.admin) return back("gmail_error=no_code");
    await requireWorkspace(ctx, intent.workspaceId);
    try {
      const t = await exchangeGmailCode(code, url.origin);
      const email = emailFromIdToken(t.id_token);
      if (!email) return back("gmail_error=no_email");
      if (!t.scope.includes("gmail.readonly") && !t.scope.includes("gmail.modify")) return back("gmail_error=read_permission_not_granted");
      let accountId = intent.accountId;
      if (accountId) {
        const { data: acc } = await ctx.db.from("ip_accounts").select("id,email").eq("id", accountId).maybeSingle();
        // Adding permissions must come from the same Google account.
        if (!acc || acc.email !== email) return back("gmail_error=different_account");
      } else {
        const { data: existing } = await ctx.db.from("ip_accounts").select("id").eq("workspace_id", intent.workspaceId).eq("provider", "gmail").eq("email", email).maybeSingle();
        if (existing) accountId = existing.id;
        else {
          const { data, error } = await ctx.db.from("ip_accounts").insert({ workspace_id: intent.workspaceId, user_id: ctx.userId, provider: "gmail", email, sync_state: { phase: "initial", fetched: 0 } }).select("id").single();
          if (error) throw new Error(error.message);
          accountId = data.id;
        }
      }
      const scopes = await saveGmailTokens(ctx.admin, accountId!, t);
      await ctx.db.from("ip_accounts").update({ scopes, status: "active", last_error: null }).eq("id", accountId!);
      await audit(ctx.db, intent.workspaceId, "user", "account.connect", accountId!, { provider: "gmail", email, level: intent.level });
      return back(`gmail=connected&account=${accountId}`);
    } catch (e) {
      await audit(ctx.db, intent.workspaceId, "system", "account.connect_failed", null, { message: e instanceof Error ? e.message : String(e) });
      return back("gmail_error=failed");
    }
  });
}
