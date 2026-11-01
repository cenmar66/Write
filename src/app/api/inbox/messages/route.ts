import { providerFor } from "@/lib/inbox/mail/provider";
import { enrich, listMessages, scopeWorkspaces, type View } from "@/lib/inbox/server/queries";
import { storeMessages } from "@/lib/inbox/server/sync";
import { processNewMessages } from "@/lib/inbox/server/process";
import { audit, body, handle, HttpError, isUuid, loadPrefs, rateLimit } from "@/lib/inbox/server/workspace";
import { snoozeUntil, type SnoozePreset } from "@/lib/inbox/time";
import type { AccountRow, MessageRow } from "@/lib/inbox/types";

/** GET ?ws=<id|all>&view=priority|attention|all|sent|snoozed|done|category:<key>&q=&account=&before= */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const u = new URL(request.url);
    const wsIds = await scopeWorkspaces(ctx, u.searchParams.get("ws"));
    const view = (u.searchParams.get("view") || "all") as View;
    const q = u.searchParams.get("q")?.slice(0, 500) ?? "";
    const account = u.searchParams.get("account");
    let rows = await listMessages(ctx.db, wsIds, { view, q, account: isUuid(account) ? account : null, before: u.searchParams.get("before"), limit: Number(u.searchParams.get("limit") ?? 50) });

    // Deep search: also ask Gmail (older mail not stored yet), then store what it finds.
    if (q && u.searchParams.get("deep") === "1") {
      rateLimit(`deep:${ctx.userId}`, 10);
      const prefs = await loadPrefs(ctx);
      const { data: accs } = await ctx.db.from("ip_accounts").select("*").in("workspace_id", wsIds).eq("status", "active");
      for (const acc of (accs ?? []) as AccountRow[]) {
        const p = await providerFor(acc, { admin: ctx.admin });
        if (!p.capabilities(acc).search) continue;
        const ids = await p.search(acc, q.replace(/\b(priority|category|status|account|task):\S+/g, ""), 25).catch(() => []);
        const msgs = await p.getMessages(acc, ids, { format: "full" }).catch(() => []);
        const fresh = await storeMessages(ctx.db, acc, msgs, prefs);
        await processNewMessages(ctx.db, ctx.admin, acc, fresh, prefs);
      }
      rows = await listMessages(ctx.db, wsIds, { view, q, account: isUuid(account) ? account : null, limit: 100 });
    }
    return { messages: await enrich(ctx.db, rows) };
  });
}

/** Bulk actions on messages the user selected (all app-level unless stated). */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ ids?: string[]; action?: string; value?: string; confirm?: boolean }>(request);
    const ids = (b.ids ?? []).filter(isUuid).slice(0, 500);
    if (!ids.length) throw new HttpError(400, "Select some messages.");
    const { data } = await ctx.db.from("ip_messages").select("id,workspace_id,account_id,provider_message_id,thread_id").in("id", ids);
    const msgs = (data ?? []) as MessageRow[];
    const wsIds = await scopeWorkspaces(ctx, "all");
    if (msgs.some((m) => !wsIds.includes(m.workspace_id))) throw new HttpError(403, "Not allowed.");
    const prefs = await loadPrefs(ctx);
    const now = new Date();
    switch (b.action) {
      case "done":
        await ctx.db.from("ip_messages").update({ done_at: now.toISOString() }).in("id", ids);
        break;
      case "undone":
        await ctx.db.from("ip_messages").update({ done_at: null, snoozed_until: null, snooze_until_reply: false }).in("id", ids);
        break;
      case "snooze": {
        const until = ["later_today", "tomorrow", "next_week", "weekend"].includes(b.value ?? "") ? snoozeUntil(b.value as SnoozePreset, prefs.timezone, now) : new Date(String(b.value));
        if (Number.isNaN(+until) || until <= now) throw new HttpError(400, "Pick a time in the future.");
        await ctx.db.from("ip_messages").update({ snoozed_until: until.toISOString() }).in("id", ids);
        break;
      }
      case "category": {
        const key = String(b.value ?? "");
        const { data: cat } = await ctx.db.from("ip_categories").select("key").in("workspace_id", [...new Set(msgs.map((m) => m.workspace_id))]).eq("key", key).limit(1);
        if (!cat?.length) throw new HttpError(400, "Unknown category.");
        await ctx.db.from("ip_messages").update({ category: key }).in("id", ids);
        break;
      }
      case "archive":
      case "mark_read": {
        // Explicit, user-initiated mailbox change: needs the modify permission and a confirmation for bulk.
        if (ids.length > 1 && !b.confirm) throw new HttpError(409, `This will ${b.action === "archive" ? "archive" : "mark as read"} ${ids.length} messages in your mailbox. Confirm to continue.`);
        const { data: accs } = await ctx.db.from("ip_accounts").select("*").in("id", [...new Set(msgs.map((m) => m.account_id))]);
        const failures: string[] = [];
        for (const m of msgs) {
          const acc = (accs ?? []).find((a) => a.id === m.account_id) as AccountRow;
          const p = await providerFor(acc, { admin: ctx.admin });
          if (!p.capabilities(acc).modify) {
            failures.push(`${acc.email}: no permission to organize`);
            continue;
          }
          try {
            await p.modify(acc, m.provider_message_id, b.action === "archive" ? { remove: ["INBOX"] } : { remove: ["UNREAD"] });
            await ctx.db.from("ip_messages").update(b.action === "archive" ? { in_inbox: false, done_at: now.toISOString() } : { is_unread: false }).eq("id", m.id);
          } catch (e) {
            failures.push(e instanceof Error ? e.message : String(e));
          }
        }
        await audit(ctx.db, msgs[0].workspace_id, "user", `mail.${b.action}`, null, { count: ids.length, failures: failures.length });
        return { ok: failures.length === 0, failures: [...new Set(failures)] };
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
    await audit(ctx.db, msgs[0].workspace_id, "user", `mail.${b.action}`, null, { count: ids.length, value: b.value ?? null });
    return { ok: true };
  });
}
