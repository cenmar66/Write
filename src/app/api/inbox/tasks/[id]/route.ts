import { randomUUID } from "node:crypto";
import { audit, body, handle, HttpError, requireWorkspace } from "@/lib/inbox/server/workspace";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Parameters<Parameters<typeof handle>[0]>[0], id: string) {
  const { data } = await ctx.db.from("ip_tasks").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Task not found.");
  await requireWorkspace(ctx, data.workspace_id);
  return data;
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const t = await load(ctx, (await params).id);
    const b = await body<Record<string, unknown>>(request);
    const patch: Record<string, unknown> = {};
    const prov = { ...(t.provenance ?? {}) } as Record<string, string>;
    for (const k of ["title", "description", "project", "assignee", "notes"] as const) {
      if (b[k] !== undefined) {
        patch[k] = b[k] === null ? null : String(b[k]).slice(0, k === "title" ? 300 : 4000);
        prov[k] = "user";
      }
    }
    if (b.due_date !== undefined) {
      if (b.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.due_date))) throw new HttpError(400, "Due date must be YYYY-MM-DD.");
      patch.due_date = b.due_date || null;
      prov.due_date = "user";
    }
    if (b.priority !== undefined && ["low", "normal", "high", "urgent"].includes(String(b.priority))) {
      patch.priority = b.priority;
      prov.priority = "user";
    }
    if (b.status !== undefined && ["open", "in_progress", "done", "cancelled"].includes(String(b.status))) {
      patch.status = b.status;
      patch.completed_at = b.status === "done" ? new Date().toISOString() : null;
    }
    patch.provenance = prov;

    // Optional one-way hand-off to The Daily Canvas planner (same Supabase project).
    if (b.send_to === "canvas") {
      if (ctx.local) throw new HttpError(409, "The Daily Canvas hand-off needs the real database (not available in local demo mode).");
      if (t.external_refs?.canvas) return { ok: true, canvas: t.external_refs.canvas, already: true };
      const id = randomUUID();
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await ctx.db.from("canvas_tasks").insert({ id, section: "work", title: t.title, notes: `${t.description}\n\nFrom InboxPilot${t.source_ref ? `: ${t.source_ref.subject}` : ""}`.trim(), priority: t.priority === "urgent" ? 3 : t.priority === "high" ? 2 : 0, due_date: t.due_date, origin_date: today, source: "inboxpilot" });
      if (error) throw new HttpError(502, `Couldn't add it to The Daily Canvas: ${error.message}`);
      patch.external_refs = { ...(t.external_refs ?? {}), canvas: id };
    }
    await ctx.db.from("ip_tasks").update(patch).eq("id", t.id);
    await audit(ctx.db, t.workspace_id, "user", "task.update", t.id, { fields: Object.keys(patch) });
    return { ok: true };
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const t = await load(ctx, (await params).id);
    await ctx.db.from("ip_tasks").delete().eq("id", t.id);
    await audit(ctx.db, t.workspace_id, "user", "task.delete", t.id);
    return { ok: true };
  });
}
