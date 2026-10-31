import { providerFor } from "@/lib/inbox/mail/provider";
import { audit, body, handle, HttpError, myWorkspaces } from "@/lib/inbox/server/workspace";

const TABLES = ["ip_accounts", "ip_messages", "ip_classifications", "ip_classification_feedback", "ip_senders", "ip_categories", "ip_rules", "ip_rule_executions", "ip_tasks", "ip_followups", "ip_reminders", "ip_drafts", "ip_audit_events", "ip_ai_usage"];

/** Export everything InboxPilot holds for you (JSON). Tokens are never exported. */
export async function GET() {
  return handle(async (ctx) => {
    const ws = await myWorkspaces(ctx);
    const ids = ws.map((w) => w.id);
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), workspaces: ws };
    for (const t of TABLES) {
      const { data } = ids.length ? await ctx.db.from(t).select("*").in("workspace_id", ids).limit(50_000) : { data: [] };
      out[t] = t === "ip_accounts" ? (data ?? []).map(({ sync_cursor: _c, ...a }) => (void _c, a)) : data ?? [];
    }
    const { data: prefs } = await ctx.db.from("ip_preferences").select("*").eq("user_id", ctx.userId).maybeSingle();
    const { data: briefings } = await ctx.db.from("ip_briefings").select("*").eq("user_id", ctx.userId);
    Object.assign(out, { preferences: prefs, briefings });
    await audit(ctx.db, null, "user", "data.export");
    return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="inboxpilot-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
  });
}

/** Permanently deletes all InboxPilot data you own, after revoking mailbox access. */
export async function DELETE(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ confirm?: string }>(request);
    if (b.confirm !== "DELETE") throw new HttpError(400, 'Type DELETE to confirm.');
    const ws = (await myWorkspaces(ctx)).filter((w) => w.owner_id === ctx.userId);
    let revoked = 0;
    for (const w of ws) {
      const { data: accs } = await ctx.db.from("ip_accounts").select("*").eq("workspace_id", w.id);
      for (const a of accs ?? []) {
        try {
          await (await providerFor(a, { admin: ctx.admin })).revoke(a);
          revoked++;
        } catch {
          /* keep deleting */
        }
        if (ctx.admin) await ctx.admin.from("ip_provider_tokens").delete().eq("account_id", a.id);
      }
    }
    const { error } = await ctx.db.rpc("ip_delete_my_data");
    if (error) throw new HttpError(500, error.message);
    return { ok: true, workspaces: ws.length, revoked };
  });
}
