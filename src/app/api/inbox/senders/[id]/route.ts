import { audit, body, handle, HttpError, requireWorkspace } from "@/lib/inbox/server/workspace";

/**
 * Sender policies: VIP, always prioritize, notifications, newsletter group, default
 * category, screening, block (hide in InboxPilot only — never deletes, never touches
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
    if (b.apply_to_existing && (b.default_category || b.blocked)) {
      const { count } = await ctx.db.from("ip_messages").select("id", { count: "exact", head: true }).eq("workspace_id", s.workspace_id).eq("from_email", s.email).eq("is_sent", false);
      affected = count ?? 0;
      if (!b.confirm) return Response.json({ needsConfirmation: `This will re-file ${affected} existing message(s) from ${s.email} inside InboxPilot. Your mailbox isn't changed.`, affected }, { status: 409 });
      const mp: Record<string, unknown> = {};
      if (b.default_category) mp.category = b.default_category;
      if (b.blocked) mp.done_at = new Date().toISOString();
      await ctx.db.from("ip_messages").update(mp).eq("workspace_id", s.workspace_id).eq("from_email", s.email).eq("is_sent", false);
    }
    await ctx.db.from("ip_senders").update(patch).eq("id", s.id);
    // VIP / priority changes re-rank this sender's open mail immediately.
    if (b.is_vip === true || b.always_priority === true) await ctx.db.from("ip_messages").update({ importance: "high", priority_score: 75 }).eq("workspace_id", s.workspace_id).eq("from_email", s.email).eq("is_sent", false).is("done_at", null).lt("priority_score", 75);
    await audit(ctx.db, s.workspace_id, "user", "sender.update", s.email, { ...patch, affected });
    return { ok: true, affected };
  });
}
