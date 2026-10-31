import { scopeWorkspaces } from "@/lib/inbox/server/queries";
import { audit, body, handle, HttpError, isUuid, requireWorkspace } from "@/lib/inbox/server/workspace";

/** GET ?ws=&kind=i_owe|they_owe|commitment&status=open|done|all */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const u = new URL(request.url);
    const wsIds = await scopeWorkspaces(ctx, u.searchParams.get("ws"));
    if (!wsIds.length) return { followups: [] };
    let q = ctx.db.from("ip_followups").select("*").in("workspace_id", wsIds).eq("tracking_disabled", false);
    const kind = u.searchParams.get("kind");
    if (kind && ["i_owe", "they_owe", "commitment"].includes(kind)) q = q.eq("kind", kind);
    const status = u.searchParams.get("status") ?? "open";
    if (status === "open") q = q.in("status", ["open", "snoozed"]);
    else if (status === "done") q = q.eq("status", "done");
    const { data } = await q.order("due_at", { ascending: true, nullsFirst: false }).limit(300);
    const now = new Date();
    const rows = (data ?? []).filter((f) => !(f.status === "snoozed" && f.snoozed_until && new Date(f.snoozed_until) > now) || u.searchParams.get("include_snoozed") === "1");
    const msgIds = [...new Set(rows.map((f) => f.message_id).filter(Boolean))];
    const { data: msgs } = msgIds.length ? await ctx.db.from("ip_messages").select("id,subject,from_email,from_name,received_at,account_id").in("id", msgIds) : { data: [] };
    const mm = new Map((msgs ?? []).map((m) => [m.id, m]));
    return { followups: rows.map((f) => ({ ...f, message: mm.get(f.message_id) ?? null })) };
  });
}

/** Manually track something. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ ws?: string; message_id?: string; kind?: string; title?: string; due_at?: string | null; counterpart?: string }>(request);
    const ws = await requireWorkspace(ctx, b.ws);
    const kind = ["i_owe", "they_owe", "commitment"].includes(b.kind ?? "") ? b.kind : "they_owe";
    const title = String(b.title ?? "").trim().slice(0, 300);
    if (!title) throw new HttpError(400, "Describe what you're tracking.");
    let thread: string | null = null;
    let account: string | null = null;
    if (isUuid(b.message_id)) {
      const { data: m } = await ctx.db.from("ip_messages").select("thread_id,account_id,workspace_id").eq("id", b.message_id).maybeSingle();
      if (!m || m.workspace_id !== ws.id) throw new HttpError(400, "Message not in this workspace.");
      thread = m.thread_id;
      account = m.account_id;
    }
    const due = b.due_at ? new Date(b.due_at) : null;
    const { data, error } = await ctx.db.from("ip_followups").insert({
      workspace_id: ws.id, account_id: account, thread_id: thread, message_id: isUuid(b.message_id) ? b.message_id : null, kind, title, counterpart: String(b.counterpart ?? "").slice(0, 200),
      due_at: due && !Number.isNaN(+due) ? due.toISOString() : null, due_explicit: !!due, detected_by: "user", confidence: 1, dedupe_key: `user:${crypto.randomUUID()}`,
    }).select().single();
    if (error) throw new HttpError(500, error.message);
    await audit(ctx.db, ws.id, "user", "followup.create", data.id, { kind });
    return { followup: data };
  });
}
