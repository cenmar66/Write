// Mailbox synchronization: resumable initial import, then incremental changes.
// Idempotent by design: messages are keyed by (account, provider id), so re-running a
// page, a retried job or two overlapping runs can't create duplicates.

import type { Db } from "../db";
import { providerFor, ProviderError } from "../mail/provider";
import type { AccountRow, MessageRow, NormalizedMessage, Preferences } from "../types";
import { processNewMessages } from "./process";

export interface SyncResult {
  phase: "initial" | "incremental";
  fetched: number;
  inserted: number;
  removed: number;
  done: boolean;
  error?: string;
}

export const INITIAL_WINDOW_DAYS = 30;
export const INITIAL_MAX_MESSAGES = 1000;
const BODY_MAX = 20_000;

export function toRow(m: NormalizedMessage, acc: Pick<AccountRow, "id" | "workspace_id">, prefs: Pick<Preferences, "body_retention_days">) {
  const keepBody = prefs.body_retention_days > 0 && m.bodyText != null;
  return {
    workspace_id: acc.workspace_id,
    account_id: acc.id,
    provider_message_id: m.providerMessageId,
    provider_thread_id: m.providerThreadId,
    rfc_message_id: m.rfcMessageId,
    in_reply_to: m.inReplyTo,
    from_email: m.from.email,
    from_name: m.from.name,
    to_addrs: m.to,
    cc_addrs: m.cc,
    reply_to: m.replyTo,
    subject: m.subject.slice(0, 1000),
    snippet: m.snippet.slice(0, 500),
    body_text: keepBody ? m.bodyText!.slice(0, BODY_MAX) : null,
    body_expires_at: keepBody ? new Date(Date.now() + prefs.body_retention_days * 86_400_000).toISOString() : null,
    received_at: m.receivedAt,
    label_ids: m.labelIds,
    is_unread: m.isUnread,
    is_starred: m.isStarred,
    is_sent: m.isSent,
    in_inbox: m.inInbox,
    has_attachments: m.attachments.length > 0,
    attachments: m.attachments.slice(0, 20),
    list_id: m.listId,
    list_unsubscribe: m.listUnsubscribe,
    auto_submitted: m.autoSubmitted,
    precedence: m.precedence,
    signals: m.signals,
  };
}

/** Stores messages; returns the rows that were new. */
export async function storeMessages(db: Db, acc: AccountRow, msgs: NormalizedMessage[], prefs: Preferences): Promise<MessageRow[]> {
  if (!msgs.length) return [];
  const ids = msgs.map((m) => m.providerMessageId);
  const { data: existing } = await db.from("ip_messages").select("provider_message_id").eq("account_id", acc.id).in("provider_message_id", ids);
  const known = new Set((existing ?? []).map((r) => r.provider_message_id as string));

  // Threads first, so messages can point at them.
  const threadIds = [...new Set(msgs.map((m) => m.providerThreadId))];
  await db.from("ip_threads").upsert(threadIds.map((t) => ({ workspace_id: acc.workspace_id, account_id: acc.id, provider_thread_id: t })), { onConflict: "account_id,provider_thread_id", ignoreDuplicates: true });
  const { data: threads } = await db.from("ip_threads").select("id,provider_thread_id").eq("account_id", acc.id).in("provider_thread_id", threadIds);
  const threadMap = new Map((threads ?? []).map((t) => [t.provider_thread_id as string, t.id as string]));

  const rows = msgs.map((m) => ({ ...toRow(m, acc, prefs), thread_id: threadMap.get(m.providerThreadId) ?? null }));
  // Existing rows: refresh provider-owned fields only (labels, read state), never our own (category, snooze, done).
  for (const r of rows.filter((r) => known.has(r.provider_message_id))) {
    await db.from("ip_messages").update({ label_ids: r.label_ids, is_unread: r.is_unread, is_starred: r.is_starred, in_inbox: r.in_inbox }).eq("account_id", acc.id).eq("provider_message_id", r.provider_message_id);
  }
  const fresh = rows.filter((r) => !known.has(r.provider_message_id));
  if (!fresh.length) return [];
  const { data: inserted, error } = await db.from("ip_messages").upsert(fresh, { onConflict: "account_id,provider_message_id", ignoreDuplicates: true }).select();
  if (error) throw new Error(`Saving messages failed: ${error.message}`);

  // Thread summaries.
  for (const tid of new Set(fresh.map((r) => r.thread_id).filter((x): x is string => !!x))) {
    const { data: tm } = await db.from("ip_messages").select("subject,received_at,from_email,from_name").eq("thread_id", tid).order("received_at");
    if (!tm?.length) continue;
    const participants = [...new Map(tm.map((x) => [x.from_email, { email: x.from_email, name: x.from_name }])).values()].slice(0, 20);
    await db.from("ip_threads").update({ subject: tm[0].subject, last_message_at: tm[tm.length - 1].received_at, message_count: tm.length, participants }).eq("id", tid);
  }
  return (inserted ?? []) as MessageRow[];
}

/**
 * Runs one sync step for an account within a time budget. Initial import continues on
 * the next call (cron or "Sync now") from where it stopped.
 */
export async function syncAccount(db: Db, admin: Db | null, acc: AccountRow, prefs: Preferences, opts: { budgetMs?: number; now?: Date } = {}): Promise<SyncResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 20_000;
  const provider = await providerFor(acc, { admin });
  const metadataOnly = prefs.body_retention_days === 0 && prefs.ai_content === "metadata";
  const format = metadataOnly ? "metadata" : "full";
  const result: SyncResult = { phase: acc.sync_state?.phase === "done" && acc.sync_cursor ? "incremental" : "initial", fetched: 0, inserted: 0, removed: 0, done: false };
  await db.from("ip_accounts").update({ status: "syncing" }).eq("id", acc.id);
  try {
    if (result.phase === "initial") {
      const state = { phase: "initial" as const, fetched: 0, target: 0, pageToken: null as string | null, startedAt: new Date().toISOString(), ...(acc.sync_state ?? {}) };
      let cursor = (acc.sync_state as { cursorAtStart?: string })?.cursorAtStart ?? null;
      do {
        const page = await provider.listPage(acc, { pageToken: state.pageToken ?? null, maxResults: 100, newerThanDays: INITIAL_WINDOW_DAYS });
        cursor ??= page.cursor;
        if (page.estimate) state.target = Math.min(INITIAL_MAX_MESSAGES, Math.max(state.target ?? 0, page.estimate));
        const msgs = await provider.getMessages(acc, page.ids.map((x) => x.id), { format });
        const fresh = await storeMessages(db, acc, msgs, prefs);
        await processNewMessages(db, admin, acc, fresh, prefs, opts.now);
        result.fetched += msgs.length;
        result.inserted += fresh.length;
        state.fetched = (state.fetched ?? 0) + msgs.length;
        state.pageToken = page.nextPageToken;
        const finished = !page.nextPageToken || state.fetched >= INITIAL_MAX_MESSAGES;
        await db.from("ip_accounts").update({
          sync_state: finished ? { phase: "done", fetched: state.fetched, target: state.fetched } : { ...state, cursorAtStart: cursor },
          ...(finished ? { sync_cursor: cursor } : {}),
          last_sync_at: new Date().toISOString(),
        }).eq("id", acc.id);
        if (finished) {
          result.done = true;
          break;
        }
      } while (Date.now() - started < budget);
    } else {
      const changes = await provider.listChanges(acc, acc.sync_cursor!);
      if (changes.expired) {
        await db.from("ip_accounts").update({ sync_state: { phase: "initial", fetched: 0 }, sync_cursor: null }).eq("id", acc.id);
        return { ...result, error: "Gmail history expired; a full re-sync was scheduled (no duplicates will be created)." };
      }
      const toFetch = [...changes.added, ...changes.changed];
      for (let i = 0; i < toFetch.length && Date.now() - started < budget; i += 50) {
        const msgs = await provider.getMessages(acc, toFetch.slice(i, i + 50), { format });
        const fresh = await storeMessages(db, acc, msgs, prefs);
        await processNewMessages(db, admin, acc, fresh, prefs, opts.now);
        result.fetched += msgs.length;
        result.inserted += fresh.length;
      }
      if (changes.removed.length) {
        await db.from("ip_messages").delete().eq("account_id", acc.id).in("provider_message_id", changes.removed);
        result.removed = changes.removed.length;
      }
      await db.from("ip_accounts").update({ sync_cursor: changes.cursor, last_sync_at: new Date().toISOString() }).eq("id", acc.id);
      result.done = true;
    }
    await db.from("ip_accounts").update({ status: "active", last_error: null }).eq("id", acc.id);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e instanceof ProviderError && e.kind === "auth" ? "needs_reconnect" : "error";
    await db.from("ip_accounts").update({ status, last_error: msg.slice(0, 500) }).eq("id", acc.id);
    return { ...result, error: msg };
  }
}

/** Drops stored message bodies past their retention date (metadata stays). */
export async function pruneBodies(db: Db) {
  await db.from("ip_messages").update({ body_text: null, body_expires_at: null }).lt("body_expires_at", new Date().toISOString());
}
