// Read paths shared by the API routes: message lists for each view, enrichment, counts.

import type { Db, InboxCtx } from "../db";
import { parseQuery, type SearchFilters } from "../search";
import type { RuleMessage } from "../rules";
import type { AccountRow, ClassificationRow, MessageRow } from "../types";
import { myWorkspaces } from "./workspace";

export const LIST_COLUMNS = "id,workspace_id,account_id,thread_id,provider_thread_id,from_email,from_name,to_addrs,cc_addrs,subject,snippet,received_at,is_unread,is_starred,is_sent,in_inbox,has_attachments,category,importance,priority_score,snoozed_until,snooze_until_reply,done_at,signals,list_unsubscribe";

export type View = "home" | "priority" | "attention" | "all" | "sent" | "snoozed" | "done" | `category:${string}`;

/** Workspaces the request may read: one (membership-checked) or all of the user's. */
export async function scopeWorkspaces(ctx: Pick<InboxCtx, "db" | "userId">, ws: string | null): Promise<string[]> {
  const mine = await myWorkspaces(ctx);
  if (!ws || ws === "all") return mine.map((w) => w.id);
  return mine.some((w) => w.id === ws) ? [ws] : [];
}

const SAFE = /[^\p{L}\p{N}@._ +-]/gu;

export async function listMessages(db: Db, wsIds: string[], opts: { view: View; q?: string; account?: string | null; limit?: number; before?: string | null; now?: Date }) {
  if (!wsIds.length) return [];
  const now = (opts.now ?? new Date()).toISOString();
  const f: SearchFilters = opts.q ? parseQuery(opts.q) : { text: [] };
  let q = db.from("ip_messages").select(LIST_COLUMNS).in("workspace_id", wsIds);
  const v = opts.view;
  const active = () => {
    q = q.is("done_at", null).or(`snoozed_until.is.null,snoozed_until.lte.${now}`);
  };
  if (v === "priority") {
    active();
    q = q.eq("is_sent", false).gte("priority_score", 60);
  } else if (v === "attention") {
    active();
    q = q.eq("is_sent", false).eq("category", "needs_attention");
  } else if (v === "sent") q = q.eq("is_sent", true);
  else if (v === "snoozed") q = q.gt("snoozed_until", now);
  else if (v === "done") q = q.not("done_at", "is", null);
  else if (v.startsWith("category:")) {
    active();
    q = q.eq("is_sent", false).eq("category", v.slice(9));
  } else if (!opts.q) {
    // All Mail hides only what you've snoozed.
    q = q.or(`snoozed_until.is.null,snoozed_until.lte.${now}`);
  }
  if (opts.account) q = q.eq("account_id", opts.account);
  if (f.from) q = q.ilike("from_email", `%${f.from.replace(SAFE, "")}%`);
  if (f.subject) q = q.ilike("subject", `%${f.subject.replace(SAFE, "")}%`);
  if (f.after) q = q.gte("received_at", f.after);
  if (f.before) q = q.lt("received_at", f.before);
  if (f.unread) q = q.eq("is_unread", true);
  if (f.hasAttachment) q = q.eq("has_attachments", true);
  if (f.sentByMe) q = q.eq("is_sent", true);
  if (f.importance) q = q.in("importance", f.importance);
  if (f.category) q = q.eq("category", f.category);
  if (f.status === "done") q = q.not("done_at", "is", null);
  if (f.status === "snoozed") q = q.gt("snoozed_until", now);
  for (const t of f.text.map((t) => t.replace(SAFE, "").trim()).filter(Boolean).slice(0, 4)) {
    q = q.or(`subject.ilike.%${t}%,snippet.ilike.%${t}%,from_email.ilike.%${t}%,from_name.ilike.%${t}%`);
  }
  if (opts.before) q = q.lt("received_at", opts.before);
  q = v === "priority" ? q.order("priority_score", { ascending: false }).order("received_at", { ascending: false }) : q.order("received_at", { ascending: false });
  const { data, error } = await q.limit(Math.min(opts.limit ?? 50, 200));
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as MessageRow[];
  // Filters PostgREST can't express on jsonb arrays are applied here (bounded result set).
  if (f.to) rows = rows.filter((m) => [...(m.to_addrs ?? []), ...(m.cc_addrs ?? [])].some((a) => a.email.includes(f.to!)));
  if (f.domain) rows = rows.filter((m) => m.from_email.endsWith(`@${f.domain}`) || m.from_email.endsWith(`.${f.domain}`));
  return rows;
}

export async function enrich(db: Db, rows: MessageRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const accIds = [...new Set(rows.map((r) => r.account_id))];
  const [cls, accs] = await Promise.all([
    db.from("ip_classifications").select("message_id,importance,msg_type,action,time_sensitivity,category,priority_score,confidence,explanation,source,user_corrected,injection_flag").in("message_id", ids),
    db.from("ip_accounts").select("id,email,provider,workspace_id").in("id", accIds),
  ]);
  const wsIds = [...new Set(rows.map((r) => r.workspace_id))];
  const emails = [...new Set(rows.map((r) => r.from_email))];
  const { data: senders } = await db.from("ip_senders").select("workspace_id,email,is_vip,blocked,screening").in("workspace_id", wsIds).in("email", emails);
  const cmap = new Map(((cls.data ?? []) as ClassificationRow[]).map((c) => [c.message_id, c]));
  const amap = new Map(((accs.data ?? []) as AccountRow[]).map((a) => [a.id, a]));
  const smap = new Map((senders ?? []).map((s) => [`${s.workspace_id}|${s.email}`, s]));
  return rows.map((m) => {
    const s = smap.get(`${m.workspace_id}|${m.from_email}`);
    return { ...m, c: cmap.get(m.id) ?? null, account_email: amap.get(m.account_id)?.email ?? "", provider: amap.get(m.account_id)?.provider ?? "", vip: !!s?.is_vip, screening: s?.screening ?? "unknown", blocked: !!s?.blocked };
  });
}

export async function counts(db: Db, wsIds: string[], now = new Date()) {
  if (!wsIds.length) return {};
  const iso = now.toISOString();
  const base = () => db.from("ip_messages").select("id", { count: "exact", head: true }).in("workspace_id", wsIds).eq("is_sent", false).is("done_at", null).or(`snoozed_until.is.null,snoozed_until.lte.${iso}`);
  const [priority, unread, attention, review, followOwe, followWait, tasks] = await Promise.all([
    base().gte("priority_score", 60),
    base().eq("is_unread", true),
    base().eq("category", "needs_attention"),
    base().eq("category", "review"),
    db.from("ip_followups").select("id", { count: "exact", head: true }).in("workspace_id", wsIds).eq("status", "open").eq("kind", "i_owe"),
    db.from("ip_followups").select("id", { count: "exact", head: true }).in("workspace_id", wsIds).eq("status", "open").eq("kind", "they_owe"),
    db.from("ip_tasks").select("id", { count: "exact", head: true }).in("workspace_id", wsIds).in("status", ["open", "in_progress"]),
  ]);
  const { data: cats } = await db.from("ip_messages").select("category").in("workspace_id", wsIds).eq("is_sent", false).is("done_at", null).eq("is_unread", true).limit(5000);
  const byCategory: Record<string, number> = {};
  for (const r of cats ?? []) if (r.category) byCategory[r.category as string] = (byCategory[r.category as string] ?? 0) + 1;
  return { priority: priority.count ?? 0, unread: unread.count ?? 0, attention: attention.count ?? 0, review: review.count ?? 0, i_owe: followOwe.count ?? 0, they_owe: followWait.count ?? 0, tasks: tasks.count ?? 0, unread_by_category: byCategory };
}

/** Recent incoming messages with classifications, for rule previews and conflict checks. */
export async function sampleMessages(db: Db, workspaceId: string, n = 200): Promise<RuleMessage[]> {
  const { data } = await db.from("ip_messages").select("id,account_id,from_email,to_addrs,cc_addrs,subject,snippet,body_text,has_attachments,is_unread,list_id,received_at").eq("workspace_id", workspaceId).eq("is_sent", false).order("received_at", { ascending: false }).limit(n);
  const rows = (data ?? []) as MessageRow[];
  if (!rows.length) return [];
  const { data: cls } = await db.from("ip_classifications").select("message_id,importance,msg_type,action,time_sensitivity,category").in("message_id", rows.map((r) => r.id));
  const { data: vips } = await db.from("ip_senders").select("email").eq("workspace_id", workspaceId).eq("is_vip", true);
  const vip = new Set((vips ?? []).map((v) => v.email));
  const cmap = new Map(((cls ?? []) as ClassificationRow[]).map((c) => [c.message_id, c]));
  return rows.map((m) => ({ ...m, classification: cmap.get(m.id) ?? null, sender_vip: vip.has(m.from_email) }));
}

