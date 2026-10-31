import { audit, body, handle, HttpError, requireWorkspace } from "@/lib/inbox/server/workspace";

/** Custom virtual categories (InboxPilot only; nothing is created in Gmail). */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ ws?: string; name?: string; icon?: string }>(request);
    const ws = await requireWorkspace(ctx, b.ws);
    const name = String(b.name ?? "").trim().slice(0, 40);
    if (!name) throw new HttpError(400, "Name the category.");
    const key = `c_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "custom"}`;
    const { data, error } = await ctx.db.from("ip_categories").insert({ workspace_id: ws.id, key, name, icon: String(b.icon ?? "tag").slice(0, 30), position: 100 }).select().single();
    if (error) throw new HttpError(409, "A category with that name already exists.");
    await audit(ctx.db, ws.id, "user", "category.create", key);
    return { category: data };
  });
}

/** Rename, hide, reorder. System categories can be renamed or hidden, not deleted. */
export async function PATCH(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ id?: string; name?: string; hidden?: boolean; position?: number }>(request);
    const { data: c } = await ctx.db.from("ip_categories").select("*").eq("id", b.id ?? "").maybeSingle();
    if (!c) throw new HttpError(404, "Category not found.");
    await requireWorkspace(ctx, c.workspace_id);
    const patch: Record<string, unknown> = {};
    if (b.name) patch.name = String(b.name).slice(0, 40);
    if (b.hidden !== undefined) patch.hidden = !!b.hidden;
    if (b.position !== undefined) patch.position = Math.max(0, Math.min(1000, Number(b.position) || 0));
    await ctx.db.from("ip_categories").update(patch).eq("id", c.id);
    return { ok: true };
  });
}

/** Deletes a custom category; its messages go back to the classifier's choice ("read_later" if none). */
export async function DELETE(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ id?: string }>(request);
    const { data: c } = await ctx.db.from("ip_categories").select("*").eq("id", b.id ?? "").maybeSingle();
    if (!c) throw new HttpError(404, "Category not found.");
    await requireWorkspace(ctx, c.workspace_id);
    if (c.system) throw new HttpError(400, "Built-in categories can be hidden but not deleted.");
    await ctx.db.from("ip_messages").update({ category: "read_later" }).eq("workspace_id", c.workspace_id).eq("category", c.key);
    await ctx.db.from("ip_senders").update({ default_category: null }).eq("workspace_id", c.workspace_id).eq("default_category", c.key);
    await ctx.db.from("ip_categories").delete().eq("id", c.id);
    await audit(ctx.db, c.workspace_id, "user", "category.delete", c.key);
    return { ok: true };
  });
}
