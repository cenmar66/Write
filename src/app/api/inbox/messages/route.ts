import { providerFor } from "@/lib/inbox/mail/provider";
import { enrich, listMessagesPage, PAGE_SIZE, scopeWorkspaces, unreadInView, type View } from "@/lib/inbox/server/queries";
import { storeMessages } from "@/lib/inbox/server/sync";
import { processNewMessages } from "@/lib/inbox/server/process";
import { audit, body, handle, HttpError, isUuid, loadPrefs, rateLimit } from "@/lib/inbox/server/workspace";
import { snoozeUntil, type SnoozePreset } from "@/lib/inbox/time";
import type { AccountRow, MessageRow } from "@/lib/inbox/types";

/**
 * GET ?ws=<id|all>&view=priority|attention|all|sent|snoozed|done|category:<key>&q=&account=&page=0
 * → { messages, total, page, pageSize }. With &ids=1 → { ids, total } (up to 1,000) for "select all".
 */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const u = new URL(request.url);
    const wsIds = await scopeWorkspaces(ctx, u.searchParams.get("ws"));
    const view = (u.searchParams.get("view") || "all") as View;
    const q = u.searchParams.get("q")?.slice(0, 500) ?? "";
    const account = u.searchParams.get("account");
    const acct = isUuid(account) ? account : null;
    const page = Math.max(0, Math.min(1000, Math.floor(Number(u.searchParams.get("page") ?? 0)) || 0));
    if (u.searchParams.get("ids") === "1") {
      const all = await listMessagesPage(ctx.db, wsIds, { view, q, account: acct, idsOnly: true, limit: 1000 });
      return { ids: all.rows.map((r) => r.id), total: all.total };
    }
    const size = Math.max(1, Math.min(200, Number(u.searchParams.get("limit") ?? PAGE_SIZE) || PAGE_SIZE));
    let { rows, total } = await listMessagesPage(ctx.db, wsIds, { view, q, account: acct, before: u.searchParams.get("before"), limit: size, offset: page * size });

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
      ({ rows, total } = await listMessagesPage(ctx.db, wsIds, { view, q, account: acct, limit: size, offset: 0 }));
    }
    // Unread in this view, with the same filters as the list (matches the sidebar badge).
    const [messages, unread] = await Promise.all([enrich(ctx.db, rows), unreadInView(ctx.db, wsIds, { view, q, account: acct })]);
    return { messages, total, unread, page, pageSize: size };
  });
}

/** Bulk actions on messages the user selected (all app-level unless stated). */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ ids?: string[]; action?: string; value?: string; confirm?: boolean }>(request);
    const ids = (b.ids ?? []).filter(isUuid).slice(0, 200); // the app sends large selections in chunks of 100
    if (!ids.length) throw new HttpError(400, "Select some messages.");
    const { data } = await ctx.db.from("ip_messages").select("id,workspace_id,account_id,provider_message_id,thread_id,label_ids").in("id", ids);
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
        // Accounts connected with read-only access: the UI offers a one-click "Grant permission".
        const needsPermission = new Map<string, string>();
        const providers = await providersFor(accs as AccountRow[], ctx.admin);
        // Several mailbox calls at once (Gmail allows it); one failure doesn't stop the rest.
        await mapLimit(msgs, 8, async (m) => {
          const { acc, p } = providers.get(m.account_id)!;
          if (!p.capabilities(acc).modify) return void needsPermission.set(acc.id, acc.email);
          try {
            await p.modify(acc, m.provider_message_id, b.action === "archive" ? { remove: ["INBOX"] } : { remove: ["UNREAD"] });
            await ctx.db.from("ip_messages").update(b.action === "archive" ? { in_inbox: false, done_at: now.toISOString() } : { is_unread: false }).eq("id", m.id);
          } catch (e) {
            failures.push(e instanceof Error ? e.message : String(e));
          }
        });
        await audit(ctx.db, msgs[0].workspace_id, "user", `mail.${b.action}`, null, { count: ids.length, failures: failures.length });
        return { ok: failures.length === 0 && !needsPermission.size, failures: [...new Set(failures)], needsPermission: [...needsPermission].map(([accountId, email]) => ({ accountId, email })) };
      }
      case "trash":
      case "untrash": {
        // Delete = move to the mailbox's Trash (recoverable; Gmail empties it after 30 days).
        // Only ever from an explicit user click here; rules, AI and the assistant have no trash action.
        if (b.action === "trash" && ids.length > 1 && !b.confirm) throw new HttpError(409, `Delete ${ids.length} messages? They go to your Gmail Trash, where you can restore them for 30 days.`);
        const { data: accs } = await ctx.db.from("ip_accounts").select("*").in("id", [...new Set(msgs.map((m) => m.account_id))]);
        const failures: string[] = [];
        // Accounts connected with read-only access: the UI offers a one-click "Grant permission".
        const needsPermission = new Map<string, string>();
        let done = 0;
        const providers = await providersFor(accs as AccountRow[], ctx.admin);
        const executions: Record<string, unknown>[] = [];
        // Several mailbox calls at once (Gmail allows it); one failure doesn't stop the rest.
        await mapLimit(msgs, 8, async (m) => {
          const { acc, p } = providers.get(m.account_id)!;
          if (!p.capabilities(acc).modify) return void needsPermission.set(acc.id, acc.email);
          try {
            const labels = new Set<string>((m.label_ids as string[]) ?? []);
            if (b.action === "trash") {
              await p.trash(acc, m.provider_message_id);
              labels.delete("INBOX");
              labels.add("TRASH");
              await ctx.db.from("ip_messages").update({ label_ids: [...labels], in_inbox: false, done_at: now.toISOString() }).eq("id", m.id);
            } else {
              await p.untrash(acc, m.provider_message_id);
              labels.delete("TRASH");
              labels.add("INBOX");
              await ctx.db.from("ip_messages").update({ label_ids: [...labels], in_inbox: true, done_at: null }).eq("id", m.id);
            }
            executions.push({ workspace_id: m.workspace_id, rule_id: null, rule_name: "You", message_id: m.id, action: { kind: b.action, value: null, at: now.toISOString() }, status: "applied", provider_applied: true, undo: b.action === "trash" ? { untrash: true } : null });
            done++;
          } catch (e) {
            failures.push(e instanceof Error ? e.message : String(e));
          }
        });
        if (executions.length) await ctx.db.from("ip_rule_executions").insert(executions);
        await audit(ctx.db, msgs[0].workspace_id, "user", `mail.${b.action}`, null, { count: done, failures: failures.length });
        return { ok: failures.length === 0 && !needsPermission.size, done, failures: [...new Set(failures)], needsPermission: [...needsPermission].map(([accountId, email]) => ({ accountId, email })) };
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
    await audit(ctx.db, msgs[0].workspace_id, "user", `mail.${b.action}`, null, { count: ids.length, value: b.value ?? null });
    return { ok: true };
  });
}

/** One provider per account (not per message). */
async function providersFor(accs: AccountRow[], admin: Parameters<typeof providerFor>[1]["admin"]) {
  const out = new Map<string, { acc: AccountRow; p: Awaited<ReturnType<typeof providerFor>> }>();
  for (const acc of accs ?? []) out.set(acc.id, { acc, p: await providerFor(acc, { admin }) });
  return out;
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}
