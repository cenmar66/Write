import { audit, body, handle, HttpError, requireWorkspace } from "@/lib/inbox/server/workspace";
import type { AccountRow } from "@/lib/inbox/types";

/**
 * Sender policies: VIP, always prioritize, notifications, newsletter group, default
 * category, screening, block (hide in InboxSatori only — never deletes, never touches
 * Gmail spam). "apply_to_existing" re-files past mail and needs confirmation.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { data: s } = await ctx.db.from("ip_senders").select("*").eq("id", (await params).id).maybeSingle();
    if (!s) throw new HttpError(404, "Sender not found.");
    await requireWorkspace(ctx, s.workspace_id);
    const b = await body<{ is_vip?: boolean; always_priority?: boolean; suppress_notifications?: boolean; screening?: string; default_category?: string | null; blocked?: boolean; apply_to_existing?: boolean; confirm?: boolean }>(request);
    const patch: Record<string, unknown> = {};
    for (const k of ["is_vip", "always_priority", "suppress_notifications", "blocked"] as const) if (b[k] !== undefined) patch[k] = !!b[k];
    if (b.screening && ["unknown", "approved", "screened_out"].includes(b.screening)) patch.screening = b.screening;
    if (b.default_category !== undefined) {
      if (b.default_category) {
        const { data: cat } = await ctx.db.from("ip_categories").select("key").eq("workspace_id", s.workspace_id).eq("key", b.default_category).maybeSingle();
        if (!cat) throw new HttpError(400, "Unknown category.");
      }
      patch.default_category = b.default_category || null;
    }
    let affected = 0;
    let archived = 0;
    let restored = 0;
    if (b.apply_to_existing && b.default_category && !b.blocked) {
      const { count } = await ctx.db.from("ip_messages").select("id", { count: "exact", head: true }).eq("workspace_id", s.workspace_id).eq("from_email", s.email).eq("is_sent", false);
      affected = count ?? 0;
      if (!b.confirm) return Response.json({ needsConfirmation: `This will re-file ${affected} existing message(s) from ${s.email} inside InboxSatori. Your mailbox isn't changed.`, affected }, { status: 409 });
      await ctx.db.from("ip_messages").update({ category: b.default_category }).eq("workspace_id", s.workspace_id).eq("from_email", s.email).eq("is_sent", false);
    }
    if (b.blocked === true) {
      // Black Hole: existing mail too (with confirmation), then every future message on arrival.
      const { blackHoleSender, canArchiveIn, senderMail } = await import("@/lib/inbox/server/black-hole");
      if (!b.confirm) {
        affected = (await senderMail(ctx, s)).length;
        const canArchive = await canArchiveIn(ctx, s.workspace_id);
        return Response.json({
          needsConfirmation: `Send ${s.email} to the Black Hole? Their ${affected} existing message(s) and all future mail will be marked done${canArchive ? " and archived out of your Gmail inbox (still searchable; undo any time)" : " in InboxSatori (grant Organize permission to also clear them from your Gmail inbox)"}. Nothing is deleted.`,
          affected,
        }, { status: 409 });
      }
      ({ affected, archived } = await blackHoleSender(ctx, s));
    }
    if (b.blocked === false && s.blocked) {
      // Leaving the Black Hole: undo the archives it made and bring the mail back.
      const { data: msgs } = await ctx.db.from("ip_messages").select("id,account_id,provider_message_id").eq("workspace_id", s.workspace_id).eq("from_email", s.email);
      const ids = (msgs ?? []).map((m) => m.id);
      const { data: ex } = ids.length ? await ctx.db.from("ip_rule_executions").select("id,message_id,undo").in("message_id", ids).eq("rule_name", "Black Hole").eq("status", "applied") : { data: [] };
      const { providerFor } = await import("@/lib/inbox/mail/provider");
      const { data: accs } = await ctx.db.from("ip_accounts").select("*").eq("workspace_id", s.workspace_id);
      for (const e of ex ?? []) {
        const m = (msgs ?? []).find((x) => x.id === e.message_id)!;
        const acc = (accs ?? []).find((a) => a.id === m.account_id) as AccountRow | undefined;
        if (!acc) continue;
        try {
          await (await providerFor(acc, { admin: ctx.admin })).modify(acc, m.provider_message_id, (e.undo as { add?: string[]; remove?: string[] } | null) ?? { add: ["INBOX"] });
          await ctx.db.from("ip_rule_executions").update({ status: "undone" }).eq("id", e.id);
          await ctx.db.from("ip_messages").update({ in_inbox: true }).eq("id", m.id);
          restored++;
        } catch {
          /* leave it; it's still in Action history */
        }
      }
      if (ids.length) await ctx.db.from("ip_messages").update({ done_at: null }).in("id", ids);
    }
    await ctx.db.from("ip_senders").update(patch).eq("id", s.id);
    // VIP / priority changes re-rank this sender's open mail immediately.
    if (b.is_vip === true || b.always_priority === true) await ctx.db.from("ip_messages").update({ importance: "high", priority_score: 75 }).eq("workspace_id", s.workspace_id).eq("from_email", s.email).eq("is_sent", false).is("done_at", null).lt("priority_score", 75);
    await audit(ctx.db, s.workspace_id, "user", b.blocked === true ? "sender.black_hole" : "sender.update", s.email, { ...patch, affected, archived, restored });
    return { ok: true, affected, archived, restored };
  });
}
