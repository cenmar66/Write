import { providerFor } from "@/lib/inbox/mail/provider";
import { enrich } from "@/lib/inbox/server/queries";
import { audit, body, handle, HttpError, loadPrefs, requireWorkspace } from "@/lib/inbox/server/workspace";
import { snoozeUntil, type SnoozePreset } from "@/lib/inbox/time";
import { ACTIONS, IMPORTANCE, MSG_TYPES, type AccountRow, type MessageRow } from "@/lib/inbox/types";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Parameters<Parameters<typeof handle>[0]>[0], id: string) {
  const { data } = await ctx.db.from("ip_messages").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Message not found.");
  await requireWorkspace(ctx, data.workspace_id);
  return data as MessageRow;
}

/** Message + thread + intelligence. Fetches the body from the provider when it isn't stored. */
export async function GET(_request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const m = await load(ctx, (await params).id);
    const { data: acc } = await ctx.db.from("ip_accounts").select("*").eq("id", m.account_id).single();
    const provider = await providerFor(acc as AccountRow, { admin: ctx.admin });
    let body = m.body_text;
    let bodySource: "stored" | "provider" | "unavailable" = body ? "stored" : "unavailable";
    if (!body && provider.capabilities(acc as AccountRow).read) {
      try {
        const [full] = await provider.getMessages(acc as AccountRow, [m.provider_message_id], { format: "full" });
        body = full?.bodyText ?? null;
        bodySource = body ? "provider" : "unavailable"; // shown, not stored (retention setting)
      } catch {
        bodySource = "unavailable";
      }
    }
    const [{ data: cls }, { data: thread }, { data: fus }, { data: tasks }, { data: sugg }, { data: sender }, { data: drafts }] = await Promise.all([
      ctx.db.from("ip_classifications").select("*").eq("message_id", m.id).maybeSingle(),
      m.thread_id ? ctx.db.from("ip_messages").select("id,from_email,from_name,to_addrs,subject,snippet,received_at,is_sent,signals").eq("thread_id", m.thread_id).order("received_at") : Promise.resolve({ data: [] }),
      m.thread_id ? ctx.db.from("ip_followups").select("*").eq("thread_id", m.thread_id) : Promise.resolve({ data: [] }),
      ctx.db.from("ip_tasks").select("*").eq("message_id", m.id),
      ctx.db.from("ip_rule_executions").select("*").eq("message_id", m.id).order("created_at", { ascending: false }),
      ctx.db.from("ip_senders").select("*").eq("workspace_id", m.workspace_id).eq("email", m.from_email).maybeSingle(),
      ctx.db.from("ip_drafts").select("*").eq("message_id", m.id).eq("status", "draft").order("created_at", { ascending: false }),
    ]);
    const [enriched] = await enrich(ctx.db, [m]);
    return {
      message: { ...enriched, body_text: body, body_source: bodySource, rfc_message_id: m.rfc_message_id, reply_to: m.reply_to, attachments: m.attachments, list_unsubscribe: m.list_unsubscribe },
      classification: cls,
      thread: thread ?? [],
      followups: fus ?? [],
      tasks: tasks ?? [],
      suggestions: sugg ?? [],
      sender,
      drafts: drafts ?? [],
      account: { id: acc!.id, email: acc!.email, provider: acc!.provider, capabilities: provider.capabilities(acc as AccountRow) },
      webLink: provider.webLink(acc as AccountRow, m),
    };
  });
}

/**
 * Updates InboxPilot's own state for a message: correct the classification (feedback),
 * move category, snooze, done, read. Corrections teach future classification for this
 * sender, inside this workspace only.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const m = await load(ctx, (await params).id);
    const b = await body<{ correct?: { field: string; value: string; for_sender?: boolean }; category?: string; snooze?: string; snooze_until_reply?: boolean; done?: boolean; read?: boolean }>(request);
    const prefs = await loadPrefs(ctx);
    if (b.correct) {
      const { field, value } = b.correct;
      const allowed: Record<string, readonly string[]> = { importance: IMPORTANCE, msg_type: MSG_TYPES, action: ACTIONS };
      if (field === "category") {
        const { data: cat } = await ctx.db.from("ip_categories").select("key").eq("workspace_id", m.workspace_id).eq("key", value).maybeSingle();
        if (!cat) throw new HttpError(400, "Unknown category.");
      } else if (!allowed[field]?.includes(value)) throw new HttpError(400, "Invalid correction.");
      const { data: cur } = await ctx.db.from("ip_classifications").select("*").eq("message_id", m.id).maybeSingle();
      await ctx.db.from("ip_classification_feedback").insert({ workspace_id: m.workspace_id, message_id: m.id, sender_email: m.from_email, field, old_value: cur?.[field] ?? null, new_value: value });
      const scoreFor = { critical: 88, high: 70, normal: 45, low: 20 } as Record<string, number>;
      const patch: Record<string, unknown> = { [field]: value, user_corrected: true, source: "user", confidence: 1 };
      if (field === "importance") patch.priority_score = scoreFor[value];
      if (cur) await ctx.db.from("ip_classifications").update(patch).eq("message_id", m.id);
      const msgPatch: Record<string, unknown> = {};
      if (field === "importance") Object.assign(msgPatch, { importance: value, priority_score: scoreFor[value] });
      if (field === "category") msgPatch.category = value;
      if (Object.keys(msgPatch).length) await ctx.db.from("ip_messages").update(msgPatch).eq("id", m.id);
      if (b.correct.for_sender && field === "category") await ctx.db.from("ip_senders").update({ default_category: value }).eq("workspace_id", m.workspace_id).eq("email", m.from_email);
      await audit(ctx.db, m.workspace_id, "user", "classification.correct", m.id, { field, from: cur?.[field] ?? null, to: value });
    }
    if (b.category) {
      await ctx.db.from("ip_messages").update({ category: b.category }).eq("id", m.id);
    }
    if (b.snooze !== undefined || b.snooze_until_reply !== undefined) {
      if (b.snooze === "" || b.snooze === null) await ctx.db.from("ip_messages").update({ snoozed_until: null, snooze_until_reply: false }).eq("id", m.id);
      else {
        const until = b.snooze_until_reply ? new Date(Date.now() + 30 * 86_400_000) : ["later_today", "tomorrow", "next_week", "weekend"].includes(b.snooze ?? "") ? snoozeUntil(b.snooze as SnoozePreset, prefs.timezone) : new Date(String(b.snooze));
        if (Number.isNaN(+until) || until <= new Date()) throw new HttpError(400, "Pick a time in the future.");
        await ctx.db.from("ip_messages").update({ snoozed_until: until.toISOString(), snooze_until_reply: !!b.snooze_until_reply }).eq("id", m.id);
      }
    }
    if (b.done !== undefined) await ctx.db.from("ip_messages").update({ done_at: b.done ? new Date().toISOString() : null }).eq("id", m.id);
    if (b.read !== undefined) {
      // Mirrors read state to the mailbox only when allowed; otherwise it's tracked in InboxPilot.
      const { data: acc } = await ctx.db.from("ip_accounts").select("*").eq("id", m.account_id).single();
      const p = await providerFor(acc as AccountRow, { admin: ctx.admin });
      let mirrored = false;
      if (p.capabilities(acc as AccountRow).modify) {
        await p.modify(acc as AccountRow, m.provider_message_id, b.read ? { remove: ["UNREAD"] } : { add: ["UNREAD"] }).then(() => (mirrored = true)).catch(() => undefined);
      }
      await ctx.db.from("ip_messages").update({ is_unread: !b.read }).eq("id", m.id);
      return { ok: true, mirrored };
    }
    return { ok: true };
  });
}
