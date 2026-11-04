import { providerFor } from "@/lib/inbox/mail/provider";
import { audit, body, handle, HttpError, requireAccount } from "@/lib/inbox/server/workspace";

type Ctx = { params: Promise<{ id: string }> };

/** Account settings: automation mode, AI content level, label sync, pause. */
export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const acc = await requireAccount(ctx, (await params).id);
    const b = await body<{ automation_mode?: string | null; ai_content?: string | null; label_sync?: boolean; paused?: boolean; display_name?: string }>(request);
    const patch: Record<string, unknown> = {};
    if (b.automation_mode !== undefined) {
      if (b.automation_mode !== null && !["observe", "assisted", "automatic"].includes(b.automation_mode)) throw new HttpError(400, "Unknown automation mode.");
      patch.automation_mode = b.automation_mode;
    }
    const settings = { ...(acc.settings ?? {}) };
    if (b.ai_content !== undefined) {
      if (b.ai_content !== null && !["metadata", "snippet", "full"].includes(b.ai_content)) throw new HttpError(400, "Unknown AI content level.");
      settings.ai_content = b.ai_content as "metadata" | null;
    }
    if (b.label_sync !== undefined) settings.label_sync = !!b.label_sync;
    patch.settings = settings;
    if (b.paused !== undefined) patch.status = b.paused ? "paused" : "active";
    if (b.display_name !== undefined) patch.display_name = String(b.display_name).slice(0, 80);
    await ctx.db.from("ip_accounts").update(patch).eq("id", acc.id);
    await audit(ctx.db, acc.workspace_id, "user", "account.update", acc.id, patch);
    return { ok: true };
  });
}

/** Disconnect: revoke provider access, then delete every row fetched from this account. */
export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const acc = await requireAccount(ctx, (await params).id);
    let revoked = true;
    try {
      await (await providerFor(acc, { admin: ctx.admin })).revoke(acc);
    } catch {
      revoked = false;
    }
    if (ctx.admin) await ctx.admin.from("ip_provider_tokens").delete().eq("account_id", acc.id);
    const { error } = await ctx.db.from("ip_accounts").delete().eq("id", acc.id);
    if (error) throw new HttpError(500, error.message);
    await audit(ctx.db, acc.workspace_id, "user", "account.disconnect", acc.id, { email: acc.email, provider: acc.provider, revoked });
    return { ok: true, revoked };
  });
}
