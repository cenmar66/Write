import { audit, body, createWorkspace, handle, HttpError, requireWorkspace } from "@/lib/inbox/server/workspace";

export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ name?: string; kind?: string }>(request);
    const kind = b.kind === "business" || b.kind === "team" ? b.kind : "personal";
    const name = String(b.name ?? "").trim();
    if (!name) throw new HttpError(400, "Name the workspace.");
    const ws = await createWorkspace(ctx, { name, kind });
    await audit(ctx.db, ws.id, "user", "workspace.create", ws.id, { kind });
    return { workspace: ws };
  });
}

export async function PATCH(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ id?: string; name?: string; kind?: string }>(request);
    await requireWorkspace(ctx, b.id, { admin: true });
    const patch: Record<string, unknown> = {};
    if (b.name) patch.name = String(b.name).slice(0, 80);
    if (b.kind && ["personal", "business", "team"].includes(b.kind)) patch.kind = b.kind;
    await ctx.db.from("ip_workspaces").update(patch).eq("id", b.id!);
    return { ok: true };
  });
}

/** Deletes a workspace and everything in it (owner only, typed confirmation). */
export async function DELETE(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ id?: string; confirm?: string }>(request);
    const ws = await requireWorkspace(ctx, b.id, { admin: true });
    if (ws.owner_id !== ctx.userId) throw new HttpError(403, "Only the owner can delete a workspace.");
    if (b.confirm !== ws.name) throw new HttpError(400, `Type the workspace name (“${ws.name}”) to confirm.`);
    const { providerFor } = await import("@/lib/inbox/mail/provider");
    const { data: accs } = await ctx.db.from("ip_accounts").select("*").eq("workspace_id", ws.id);
    for (const a of accs ?? []) await (await providerFor(a, { admin: ctx.admin })).revoke(a).catch(() => undefined);
    await ctx.db.from("ip_workspaces").delete().eq("id", ws.id);
    await audit(ctx.db, null, "user", "workspace.delete", ws.id, { name: ws.name });
    return { ok: true };
  });
}
