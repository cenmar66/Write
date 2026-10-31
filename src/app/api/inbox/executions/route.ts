import { providerFor } from "@/lib/inbox/mail/provider";
import { scopeWorkspaces } from "@/lib/inbox/server/queries";
import { audit, body, handle, HttpError, isUuid } from "@/lib/inbox/server/workspace";
import type { AccountRow } from "@/lib/inbox/types";

/** Action history (rules, assistant, user) with suggestions waiting for approval. */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const u = new URL(request.url);
    const wsIds = await scopeWorkspaces(ctx, u.searchParams.get("ws"));
    if (!wsIds.length) return { executions: [], audit: [] };
    let q = ctx.db.from("ip_rule_executions").select("*").in("workspace_id", wsIds);
    if (u.searchParams.get("status")) q = q.eq("status", u.searchParams.get("status")!);
    const [{ data: ex }, { data: log }] = await Promise.all([
      q.order("created_at", { ascending: false }).limit(200),
      ctx.db.from("ip_audit_events").select("*").in("workspace_id", wsIds).order("created_at", { ascending: false }).limit(100),
    ]);
    const msgIds = [...new Set((ex ?? []).map((e) => e.message_id).filter(Boolean))];
    const { data: msgs } = msgIds.length ? await ctx.db.from("ip_messages").select("id,subject,from_email").in("id", msgIds) : { data: [] };
    const mm = new Map((msgs ?? []).map((m) => [m.id, m]));
    return { executions: (ex ?? []).map((e) => ({ ...e, message: mm.get(e.message_id) ?? null })), audit: log ?? [] };
  });
}

/** Approve or dismiss a suggestion; undo an applied mailbox change. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ id?: string; op?: "approve" | "dismiss" | "undo" }>(request);
    if (!isUuid(b.id)) throw new HttpError(400, "Missing id.");
    const { data: ex } = await ctx.db.from("ip_rule_executions").select("*").eq("id", b.id).maybeSingle();
    if (!ex) throw new HttpError(404, "Not found.");
    const wsIds = await scopeWorkspaces(ctx, ex.workspace_id);
    if (!wsIds.length) throw new HttpError(403, "Not allowed.");
    const { data: m } = ex.message_id ? await ctx.db.from("ip_messages").select("*").eq("id", ex.message_id).maybeSingle() : { data: null };
    const action = ex.action as { kind: string; value: string | null };

    if (b.op === "dismiss") {
      if (ex.status !== "suggested") throw new HttpError(409, "Only suggestions can be dismissed.");
      await ctx.db.from("ip_rule_executions").update({ status: "dismissed" }).eq("id", ex.id);
      return { ok: true };
    }
    if (!m) throw new HttpError(409, "The message is no longer available.");
    const { data: acc } = await ctx.db.from("ip_accounts").select("*").eq("id", m.account_id).single();
    const provider = await providerFor(acc as AccountRow, { admin: ctx.admin });

    if (b.op === "approve") {
      if (ex.status !== "suggested") throw new HttpError(409, "Already handled.");
      let undo: Record<string, unknown> | null = null;
      if (action.kind.startsWith("gmail_") && !provider.capabilities(acc as AccountRow).modify) throw new HttpError(403, "InboxPilot doesn't have permission to organize this mailbox. Grant it in Connected Accounts.");
      if (action.kind === "gmail_archive") {
        await provider.modify(acc as AccountRow, m.provider_message_id, { remove: ["INBOX"] });
        await ctx.db.from("ip_messages").update({ in_inbox: false }).eq("id", m.id);
        undo = { add: ["INBOX"] };
      } else if (action.kind === "gmail_mark_read") {
        await provider.modify(acc as AccountRow, m.provider_message_id, { remove: ["UNREAD"] });
        await ctx.db.from("ip_messages").update({ is_unread: false }).eq("id", m.id);
        undo = { add: ["UNREAD"] };
      } else if (action.kind === "gmail_label") {
        const label = await provider.ensureLabel(acc as AccountRow, action.value ?? "Label");
        await provider.modify(acc as AccountRow, m.provider_message_id, { add: [label] });
        undo = { remove: [label] };
      } else if (action.kind === "suggest_task") {
        return Response.json({ ok: true, openTaskDialog: m.id });
      }
      await ctx.db.from("ip_rule_executions").update({ status: "approved", provider_applied: action.kind.startsWith("gmail_"), undo }).eq("id", ex.id);
      await audit(ctx.db, ex.workspace_id, "user", "suggestion.approve", ex.id, { kind: action.kind });
      return { ok: true };
    }
    if (b.op === "undo") {
      if (!["applied", "approved"].includes(ex.status) || !ex.undo) throw new HttpError(409, "Nothing to undo.");
      const u = ex.undo as { add?: string[]; remove?: string[]; done_at?: null; snoozed_until?: null };
      if (u.add || u.remove) {
        await provider.modify(acc as AccountRow, m.provider_message_id, { add: u.add, remove: u.remove });
        if (u.add?.includes("INBOX")) await ctx.db.from("ip_messages").update({ in_inbox: true, done_at: null }).eq("id", m.id);
        if (u.add?.includes("UNREAD")) await ctx.db.from("ip_messages").update({ is_unread: true }).eq("id", m.id);
      } else await ctx.db.from("ip_messages").update(u).eq("id", m.id);
      await ctx.db.from("ip_rule_executions").update({ status: "undone" }).eq("id", ex.id);
      await audit(ctx.db, ex.workspace_id, "user", "action.undo", ex.id, { kind: action.kind });
      return { ok: true };
    }
    throw new HttpError(400, "Unknown operation.");
  });
}
