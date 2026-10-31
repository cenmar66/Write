// What happens to each newly stored message:
//   sender stats → classification (rules-first, AI only when uncertain and allowed)
//   → rule actions (gated by automation mode) → follow-up / commitment tracking.

import { aiClassify, injectionFlags } from "../ai/features";
import { classifyMessage, feedbackFor } from "../classify";
import type { Db } from "../db";
import { firstDeadline } from "../deadlines";
import { analyzeThread } from "../followups";
import { domainOf } from "../mail/parse";
import { providerFor } from "../mail/provider";
import { applyToClassification, planActions, type PlannedAction, type Rule } from "../rules";
import type { AccountRow, MessageRow, Preferences, SenderRow, WorkspaceRow } from "../types";
import { entitlementFor } from "./workspace";

const AI_PER_RUN = 15;

export async function processNewMessages(db: Db, admin: Db | null, acc: AccountRow, fresh: MessageRow[], prefs: Preferences, now = new Date()) {
  if (!fresh.length) return;
  const ws = (await db.from("ip_workspaces").select("*").eq("id", acc.workspace_id).single()).data as WorkspaceRow;
  const me = new Set([acc.email.toLowerCase()]);
  const sorted = [...fresh].sort((a, b) => a.received_at.localeCompare(b.received_at));
  await updateSenders(db, acc, sorted, me);

  const emails = [...new Set(sorted.map((m) => m.from_email))];
  const { data: senders } = await db.from("ip_senders").select("*").eq("workspace_id", acc.workspace_id).in("email", emails);
  const senderMap = new Map(((senders ?? []) as SenderRow[]).map((s) => [s.email, s]));
  const { data: fb } = await db.from("ip_classification_feedback").select("sender_email,field,new_value,created_at").eq("workspace_id", acc.workspace_id).in("sender_email", emails);
  const { data: ruleRows } = await db.from("ip_rules").select("*").eq("workspace_id", acc.workspace_id).eq("enabled", true);
  const rules = (ruleRows ?? []) as Rule[];
  const mode = acc.automation_mode ?? prefs.automation_mode;
  const ent = await entitlementFor(db, acc.workspace_id);
  const provider = await providerFor(acc, { admin });
  const canModify = provider.capabilities(acc).modify;
  const aiCtx = { db, userId: acc.user_id, workspaceId: acc.workspace_id, prefs };
  const contentMode = acc.settings?.ai_content ?? prefs.ai_content;
  let aiUsed = 0;

  const threadIds = [...new Set(sorted.map((m) => m.thread_id).filter((t): t is string => !!t))];
  const { data: myThreadRows } = threadIds.length ? await db.from("ip_messages").select("thread_id").in("thread_id", threadIds).eq("is_sent", true) : { data: [] };
  const myThreads = new Set((myThreadRows ?? []).map((r) => r.thread_id as string));

  for (const m of sorted) {
    const sender = senderMap.get(m.from_email) ?? null;
    const feedback = feedbackFor((fb ?? []).filter((f) => f.sender_email === m.from_email) as { field: string; new_value: string; created_at: string }[]);
    let c = classifyMessage(m, { me, sender, feedback, iParticipated: !!m.thread_id && myThreads.has(m.thread_id), workspaceKind: ws.kind, now });
    const flags = injectionFlags(m);
    c.injection_flag = flags.length > 0;
    if (flags.length) c.factors.push({ label: `Possible prompt-injection text (${flags[0]}) — treated as plain data`, weight: 0, source: "content" });
    if (!m.is_sent && c.confidence < 0.6 && aiUsed < AI_PER_RUN && ent.features.has("ai_classification") && prefs.ai_external) {
      const ai = await aiClassify(aiCtx, m, contentMode, c, { importance: !!feedback.importance, msg_type: !!feedback.msg_type, category: !!(feedback.category || sender?.default_category) });
      aiUsed++;
      if (ai) c = { ...ai, injection_flag: c.injection_flag };
    }

    const plan = planActions(rules, { ...m, classification: c, sender_vip: !!sender?.is_vip }, mode, { canModifyProvider: canModify && ent.features.has("automatic_mode") });
    c = applyToClassification(c, plan);

    // Never overwrite a classification the user corrected.
    const { data: existing } = await db.from("ip_classifications").select("user_corrected").eq("message_id", m.id).maybeSingle();
    if (!existing?.user_corrected) {
      await db.from("ip_classifications").upsert({ message_id: m.id, workspace_id: m.workspace_id, ...c, factors: c.factors.slice(0, 20), user_corrected: false }, { onConflict: "message_id" });
    }
    await executePlan(db, provider, acc, m, plan, prefs);
    if (sender?.blocked) await db.from("ip_messages").update({ done_at: now.toISOString() }).eq("id", m.id);
  }

  // A reply in a thread wakes anything snoozed "until a reply arrives".
  for (const m of sorted.filter((x) => !x.is_sent && x.thread_id)) {
    await db.from("ip_messages").update({ snoozed_until: null, snooze_until_reply: false }).eq("thread_id", m.thread_id!).eq("snooze_until_reply", true);
  }
  await refreshFollowups(db, acc, threadIds, prefs, now);
}

async function updateSenders(db: Db, acc: AccountRow, msgs: MessageRow[], me: Set<string>) {
  const bump = new Map<string, Partial<SenderRow> & { email: string }>();
  const get = (email: string, name = "") => {
    const e = email.toLowerCase();
    if (!bump.has(e)) bump.set(e, { email: e, display_name: name, received_count: 0, replied_count: 0, sent_to_count: 0 });
    return bump.get(e)!;
  };
  for (const m of msgs) {
    if (!m.from_email) continue;
    if (!m.is_sent && !me.has(m.from_email)) {
      const s = get(m.from_email, m.from_name);
      s.received_count! += 1;
      s.last_seen = m.received_at;
      s.first_seen ??= m.received_at;
    } else if (m.is_sent) {
      const recips = [...(m.to_addrs ?? []), ...(m.cc_addrs ?? [])].map((a) => a.email.toLowerCase()).filter((e) => !me.has(e));
      let earlier: string[] = [];
      if (m.thread_id) {
        const { data } = await db.from("ip_messages").select("from_email,received_at").eq("thread_id", m.thread_id).lt("received_at", m.received_at);
        earlier = (data ?? []).map((r) => String(r.from_email).toLowerCase());
      }
      for (const r of recips) {
        const s = get(r);
        s.sent_to_count! += 1;
        if (earlier.includes(r)) s.replied_count! += 1;
      }
    }
  }
  if (!bump.size) return;
  const { data: rows } = await db.from("ip_senders").select("*").eq("workspace_id", acc.workspace_id).in("email", [...bump.keys()]);
  const cur = new Map(((rows ?? []) as SenderRow[]).map((r) => [r.email, r]));
  const upserts = [...bump.values()].map((b) => {
    const c = cur.get(b.email);
    return {
      workspace_id: acc.workspace_id,
      email: b.email,
      domain: domainOf(b.email),
      display_name: b.display_name || c?.display_name || "",
      received_count: (c?.received_count ?? 0) + (b.received_count ?? 0),
      replied_count: (c?.replied_count ?? 0) + (b.replied_count ?? 0),
      sent_to_count: (c?.sent_to_count ?? 0) + (b.sent_to_count ?? 0),
      first_seen: c?.first_seen ?? b.first_seen ?? null,
      last_seen: [c?.last_seen, b.last_seen].filter(Boolean).sort().pop() ?? null,
    };
  });
  await db.from("ip_senders").upsert(upserts, { onConflict: "workspace_id,email" });
}

/** Records every planned action; applies app-level ones and (Automatic mode only) provider ones. */
export async function executePlan(db: Db, provider: Awaited<ReturnType<typeof providerFor>>, acc: AccountRow, m: MessageRow, plan: PlannedAction[], prefs: Preferences) {
  for (const p of plan) {
    const actionKey = { kind: p.action.kind, value: p.action.value ?? null };
    let status: "suggested" | "applied" | "failed" = p.decision === "apply" ? "applied" : "suggested";
    let providerApplied = false;
    let undo: Record<string, unknown> | null = null;
    let error: string | null = null;
    if (p.decision === "blocked") continue;
    if (p.decision === "apply") {
      try {
        switch (p.action.kind) {
          case "mark_done":
            await db.from("ip_messages").update({ done_at: new Date().toISOString() }).eq("id", m.id);
            undo = { done_at: null };
            break;
          case "snooze_days": {
            const until = new Date(Date.now() + Number(p.action.value ?? 1) * 86_400_000).toISOString();
            await db.from("ip_messages").update({ snoozed_until: until }).eq("id", m.id);
            undo = { snoozed_until: null };
            break;
          }
          case "track_reply":
            if (m.is_sent) {
              const days = Number(p.action.value ?? prefs.followup_days);
              const deadline = firstDeadline(m.body_text ?? m.snippet, new Date(m.received_at));
              await db.from("ip_followups").upsert({
                workspace_id: m.workspace_id, account_id: m.account_id, thread_id: m.thread_id, message_id: m.id, kind: "they_owe",
                title: `Waiting on ${m.to_addrs?.[0]?.name || m.to_addrs?.[0]?.email || "a reply"}: ${m.subject}`.slice(0, 200),
                counterpart: m.to_addrs?.[0]?.email ?? "", due_at: deadline?.date ?? new Date(Date.parse(m.received_at) + days * 86_400_000).toISOString(),
                due_explicit: !!deadline, evidence: `Rule “${p.ruleName}”`, confidence: 0.9, detected_by: "rule", dedupe_key: `rule:${p.ruleId}:${m.id}`,
              }, { onConflict: "workspace_id,dedupe_key", ignoreDuplicates: true });
            }
            break;
          case "gmail_label": {
            const label = await provider.ensureLabel(acc, p.action.value ?? "Label");
            await provider.modify(acc, m.provider_message_id, { add: [label] });
            providerApplied = true;
            undo = { remove: [label] };
            break;
          }
          case "gmail_archive":
            await provider.modify(acc, m.provider_message_id, { remove: ["INBOX"] });
            await db.from("ip_messages").update({ in_inbox: false }).eq("id", m.id);
            providerApplied = true;
            undo = { add: ["INBOX"] };
            break;
          case "gmail_mark_read":
            await provider.modify(acc, m.provider_message_id, { remove: ["UNREAD"] });
            await db.from("ip_messages").update({ is_unread: false }).eq("id", m.id);
            providerApplied = true;
            undo = { add: ["UNREAD"] };
            break;
          default:
            break; // set_importance / set_category were folded into the classification
        }
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
      }
    }
    await db.from("ip_rule_executions").upsert(
      { workspace_id: m.workspace_id, rule_id: p.ruleId, rule_name: p.ruleName, message_id: m.id, action: actionKey, status, provider_applied: providerApplied, undo, error },
      { onConflict: "rule_id,message_id,action", ignoreDuplicates: true },
    );
  }
}

/** Re-analyses threads and keeps follow-ups in step (new ones added, answered ones closed). */
export async function refreshFollowups(db: Db, acc: AccountRow, threadIds: string[], prefs: Preferences, now = new Date()) {
  const me = new Set([acc.email.toLowerCase()]);
  for (const tid of threadIds) {
    const { data: msgs } = await db.from("ip_messages").select("*").eq("thread_id", tid).order("received_at");
    if (!msgs?.length) continue;
    const { data: prev } = await db.from("ip_followups").select("id,dedupe_key,status,detected_by,tracking_disabled").eq("thread_id", tid);
    if ((prev ?? []).some((f) => f.tracking_disabled)) continue;
    const found = analyzeThread(msgs as MessageRow[], me, { now, thresholdDays: prefs.followup_days });
    if (found.length) {
      await db.from("ip_followups").upsert(
        found.map((f) => ({ workspace_id: acc.workspace_id, account_id: acc.id, thread_id: tid, message_id: f.message_id, kind: f.kind, title: f.title.slice(0, 300), counterpart: f.counterpart, due_at: f.due_at, due_explicit: f.due_explicit, evidence: f.evidence, confidence: f.confidence, detected_by: "rule", dedupe_key: f.dedupe_key })),
        { onConflict: "workspace_id,dedupe_key", ignoreDuplicates: true },
      );
    }
    // Anything detected earlier that the thread no longer supports (someone replied) is resolved.
    const current = new Set(found.map((f) => f.dedupe_key));
    const stale = (prev ?? []).filter((f) => f.status === "open" && f.detected_by === "rule" && String(f.dedupe_key).startsWith("thread:") && !current.has(String(f.dedupe_key)));
    if (stale.length) await db.from("ip_followups").update({ status: "done" }).in("id", stale.map((f) => f.id));
  }
}
