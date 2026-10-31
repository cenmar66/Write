import { syncAccount } from "@/lib/inbox/server/sync";
import { handle, HttpError, loadPrefs, rateLimit, requireAccount } from "@/lib/inbox/server/workspace";

export const maxDuration = 60;

/** "Sync now": one bounded sync step (the initial import resumes on the next call or cron tick). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    rateLimit(`sync:${ctx.userId}`, 12);
    const acc = await requireAccount(ctx, (await params).id);
    if (acc.status === "needs_reconnect") throw new HttpError(409, "This account needs to be reconnected first.");
    const result = await syncAccount(ctx.db, ctx.admin, acc, await loadPrefs(ctx), { budgetMs: 40_000 });
    const { data } = await ctx.db.from("ip_accounts").select("status,sync_state,last_sync_at,last_error").eq("id", acc.id).single();
    return { result, account: data };
  });
}
