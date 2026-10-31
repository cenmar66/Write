// Generates and stores a briefing for one user across their workspaces.

import { aiBriefingSummary } from "../ai/features";
import { buildBriefing, briefingLinesForAi, type BriefingContent, type BriefRef } from "../briefing";
import type { Db } from "../db";
import type { ClassificationRow, FollowupRow, MessageRow, Preferences, TaskRow } from "../types";

export async function generateBriefing(db: Db, userId: string, workspaceIds: string[], prefs: Preferences, slot: "morning" | "midday" | "evening" | "on_demand", opts: { now?: Date; mode?: "concise" | "expanded"; useAi?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const { data: last } = await db.from("ip_briefings").select("created_at,content").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const since = last ? new Date(last.created_at) : new Date(now.getTime() - 24 * 3_600_000);
  const windowStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const empty = { data: [] as unknown[] };
  const [msgs, fus, tasks] = workspaceIds.length
    ? await Promise.all([
        db.from("ip_messages").select("id,workspace_id,from_email,from_name,subject,received_at,is_sent,done_at,snoozed_until,category").in("workspace_id", workspaceIds).gte("received_at", windowStart).order("received_at", { ascending: false }).limit(1000),
        db.from("ip_followups").select("*").in("workspace_id", workspaceIds).in("status", ["open", "snoozed"]).eq("tracking_disabled", false).limit(500),
        db.from("ip_tasks").select("*").in("workspace_id", workspaceIds).in("status", ["open", "in_progress"]).limit(500),
      ])
    : [empty, empty, empty];
  const messages = (msgs.data ?? []) as MessageRow[];
  const ids = messages.map((m) => m.id);
  const cls: ClassificationRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("ip_classifications").select("message_id,importance,priority_score,action,time_sensitivity,msg_type,category,explanation").in("message_id", ids.slice(i, i + 200));
    cls.push(...((data ?? []) as ClassificationRow[]));
  }
  const cmap = new Map(cls.map((c) => [c.message_id, c]));

  const content: BriefingContent = buildBriefing({
    now,
    since,
    tz: prefs.timezone,
    mode: opts.mode ?? prefs.briefing.mode,
    messages: messages.map((m) => ({ ...m, c: cmap.get(m.id) ?? null })),
    followups: (fus.data ?? []) as FollowupRow[],
    tasks: (tasks.data ?? []) as TaskRow[],
    previousCounts: (last?.content as BriefingContent | undefined)?.counts ?? null,
  });

  let summarySource: "deterministic" | "ai" = "deterministic";
  let model: string | null = null;
  if (opts.useAi !== false && prefs.ai_external) {
    const lines = briefingLinesForAi(content);
    if (lines.length) {
      const res = await aiBriefingSummary({ db, userId, workspaceId: workspaceIds[0] ?? null, prefs }, lines);
      if (res.ok && res.data.summary.length) {
        const keyToRefs = new Map(content.sections.flatMap((s) => s.items.map((i) => [i.key, i.refs] as [string, BriefRef[]])));
        content.ai_summary = res.data.summary.map((s) => ({ text: s.text, refs: s.refs.flatMap((k) => keyToRefs.get(k) ?? []) }));
        summarySource = "ai";
        model = res.model;
      } else if (!res.ok) content.ai_note = res.reason;
    }
  }

  const { data: saved, error } = await db
    .from("ip_briefings")
    .insert({ user_id: userId, workspace_ids: workspaceIds, slot, period_start: content.period.start, period_end: content.period.end, content, summary_source: summarySource, model })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return saved;
}
