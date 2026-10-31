import { validateRule } from "@/lib/inbox/rules";
import { audit, body, handle, HttpError, requireWorkspace } from "@/lib/inbox/server/workspace";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Parameters<Parameters<typeof handle>[0]>[0], id: string) {
  const { data } = await ctx.db.from("ip_rules").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Rule not found.");
  await requireWorkspace(ctx, data.workspace_id);
  return data;
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const cur = await load(ctx, (await params).id);
    const b = await body<Record<string, unknown>>(request);
    const v = validateRule({ ...cur, ...b });
    if (!v.ok) throw new HttpError(400, v.error);
    const { workspace_id: _ws, ...patch } = { ...v.rule, workspace_id: cur.workspace_id };
    void _ws;
    await ctx.db.from("ip_rules").update(patch).eq("id", cur.id);
    await audit(ctx.db, cur.workspace_id, "user", "rule.update", cur.id, { enabled: v.rule.enabled });
    return { ok: true };
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const cur = await load(ctx, (await params).id);
    await ctx.db.from("ip_rules").delete().eq("id", cur.id);
    await audit(ctx.db, cur.workspace_id, "user", "rule.delete", cur.id, { name: cur.name });
    return { ok: true };
  });
}
