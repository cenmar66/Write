import { providerFor } from "@/lib/inbox/mail/provider";
import { pushConfig } from "@/lib/inbox/push";
import { disableTrainingLabels, setupTrainingLabels } from "@/lib/inbox/server/training-labels";
import { audit, body, handle, HttpError, requireAccount } from "@/lib/inbox/server/workspace";

/**
 * SaneBox-style Gmail labels on/off for one account. On: creates "InboxSatori/…" labels
 * in the mailbox (Black Hole + one per category) and watches for the user moving mail into
 * them. Off: stops acting on label moves; the labels and the mail in them stay as they are.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const acc = await requireAccount(ctx, (await params).id);
    const b = await body<{ enable?: boolean }>(request);
    if (!b.enable) {
      await disableTrainingLabels(ctx.db, acc);
      await audit(ctx.db, acc.workspace_id, "user", "account.labels_off", acc.id);
      return { ok: true, enabled: false };
    }
    const p = await providerFor(acc, { admin: ctx.admin });
    if (!p.capabilities(acc).modify) throw new HttpError(403, "Creating Gmail labels needs the Organize permission. Grant it from Connected Accounts, then try again.");
    let map;
    try {
      map = await setupTrainingLabels(ctx.db, ctx.admin, acc);
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : String(e));
    }
    // Instant updates for this mailbox, when the server is set up for them.
    let instant = false;
    const cfg = pushConfig();
    if (cfg && p.watch) {
      try {
        const w = await p.watch(acc, cfg.topic);
        const { data: fresh } = await ctx.db.from("ip_accounts").select("settings").eq("id", acc.id).single();
        await ctx.db.from("ip_accounts").update({ settings: { ...(fresh?.settings ?? {}), watch_expires_at: w.expiration } }).eq("id", acc.id);
        instant = true;
      } catch {
        instant = false; // falls back to the 10-minute sync
      }
    }
    await audit(ctx.db, acc.workspace_id, "user", "account.labels_on", acc.id, { labels: Object.keys(map).length, instant });
    return { ok: true, enabled: true, labels: Object.keys(map).length, instant };
  });
}
