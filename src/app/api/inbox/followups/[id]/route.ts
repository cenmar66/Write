import { audit, body, handle, HttpError, loadPrefs, requireWorkspace } from "@/lib/inbox/server/workspace";
import { snoozeUntil, type SnoozePreset } from "@/lib/inbox/time";

/** Complete, snooze, re-date, disable tracking for the thread, assign. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { data: f } = await ctx.db.from("ip_followups").select("*").eq("id", (await params).id).maybeSingle();
    if (!f) throw new HttpError(404, "Not found.");
    await requireWorkspace(ctx, f.workspace_id);
    const b = await body<{ status?: string; snooze?: string; due_at?: string | null; disable_tracking?: boolean; assignee?: string | null }>(request);
    const patch: Record<string, unknown> = {};
    if (b.status && ["open", "done", "dismissed"].includes(b.status)) Object.assign(patch, { status: b.status, snoozed_until: null });
    if (b.snooze) {
      const prefs = await loadPrefs(ctx);
      const until = ["later_today", "tomorrow", "next_week", "weekend"].includes(b.snooze) ? snoozeUntil(b.snooze as SnoozePreset, prefs.timezone) : new Date(b.snooze);
      if (Number.isNaN(+until) || until <= new Date()) throw new HttpError(400, "Pick a time in the future.");
      Object.assign(patch, { status: "snoozed", snoozed_until: until.toISOString() });
    }
    if (b.due_at !== undefined) {
      const d = b.due_at ? new Date(b.due_at) : null;
      if (d && Number.isNaN(+d)) throw new HttpError(400, "Invalid date.");
      Object.assign(patch, { due_at: d?.toISOString() ?? null, due_explicit: !!d, detected_by: "user" });
    }
    if (b.assignee !== undefined) patch.assignee = b.assignee ? String(b.assignee).slice(0, 120) : null;
    if (b.disable_tracking) {
      // Stop tracking this whole conversation (future detections are skipped too).
      if (f.thread_id) await ctx.db.from("ip_followups").update({ tracking_disabled: true, status: "dismissed" }).eq("thread_id", f.thread_id);
      Object.assign(patch, { tracking_disabled: true, status: "dismissed" });
    }
    await ctx.db.from("ip_followups").update(patch).eq("id", f.id);
    await audit(ctx.db, f.workspace_id, "user", "followup.update", f.id, patch);
    return { ok: true };
  });
}
