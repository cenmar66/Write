import { scopeWorkspaces } from "@/lib/inbox/server/queries";
import { audit, body, handle, HttpError, isUuid, requireWorkspace } from "@/lib/inbox/server/workspace";
import { sourceRefFor } from "@/lib/inbox/tasks";

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const u = new URL(request.url);
    const wsIds = await scopeWorkspaces(ctx, u.searchParams.get("ws"));
    if (!wsIds.length) return { tasks: [] };
    let q = ctx.db.from("ip_tasks").select("*").in("workspace_id", wsIds);
    const status = u.searchParams.get("status") ?? "open";
    if (status === "open") q = q.in("status", ["open", "in_progress"]);
    else if (status !== "all") q = q.eq("status", status);
    const { data } = await q.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
    return { tasks: data ?? [] };
  });
}

/** Create a task (optionally from an email; keeps a permanent link to the source). */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ ws?: string; message_id?: string; title?: string; description?: string; due_date?: string | null; priority?: string; project?: string; assignee?: string; notes?: string; provenance?: Record<string, string>; suggestion_id?: string }>(request);
    const title = String(b.title ?? "").trim().slice(0, 300);
    if (!title) throw new HttpError(400, "Give the task a title.");
    let wsId = b.ws;
    let link: Record<string, unknown> = {};
    if (isUuid(b.message_id)) {
      const { data: m } = await ctx.db.from("ip_messages").select("*").eq("id", b.message_id).maybeSingle();
      if (!m) throw new HttpError(404, "Message not found.");
      wsId = m.workspace_id;
      const { data: acc } = await ctx.db.from("ip_accounts").select("email,provider").eq("id", m.account_id).single();
      link = { message_id: m.id, account_id: m.account_id, source_ref: sourceRefFor(m, acc!) };
    }
    const ws = await requireWorkspace(ctx, wsId);
    if (b.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.due_date)) throw new HttpError(400, "Due date must be YYYY-MM-DD.");
    // Fields the user saw and kept stay labelled as explicit/inferred; edited ones become "user".
    const provenance = Object.fromEntries(Object.entries(b.provenance ?? {}).filter(([, v]) => ["explicit", "inferred", "user"].includes(v)));
    const { data, error } = await ctx.db.from("ip_tasks").insert({
      workspace_id: ws.id, ...link, title, description: String(b.description ?? "").slice(0, 4000), due_date: b.due_date || null,
      priority: ["low", "normal", "high", "urgent"].includes(b.priority ?? "") ? b.priority : "normal",
      project: b.project ? String(b.project).slice(0, 120) : null, assignee: b.assignee ? String(b.assignee).slice(0, 120) : null,
      notes: String(b.notes ?? "").slice(0, 4000), provenance,
      dedupe_key: isUuid(b.message_id) ? `msg:${b.message_id}:${title.toLowerCase()}` : null,
    }).select().single();
    if (error) throw new HttpError(error.message.includes("duplicate") ? 409 : 500, error.message.includes("duplicate") ? "That task already exists for this email." : error.message);
    if (isUuid(b.suggestion_id)) await ctx.db.from("ip_rule_executions").update({ status: "approved" }).eq("id", b.suggestion_id);
    await audit(ctx.db, ws.id, "user", "task.create", data.id, { from_email: !!link.message_id });
    return { task: data };
  });
}
