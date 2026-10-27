// Rollover and recurrence. Pure functions: given what's on the device, they return the
// records to add. Ids are deterministic (task + date), so running them again, after a
// gap of several days, or on two devices at once never produces duplicates.

import { addDays, dayOfMonth, daysInMonth, diffDays, startOfWeek, weekdayOf } from "./dates";
import { occurrenceId, placementId, stableId } from "./ids";
import type { ISODate, Placement, Recurrence, RecurrenceRule, Task, TaskEvent } from "./types";

type Draft<T> = Omit<T, "created_at" | "updated_at" | "version" | "deleted_at" | "user_id" | "sync_seq">;

export interface RolloverResult {
  placements: Draft<Placement>[];
  events: Draft<TaskEvent>[];
}

/** Latest live placement per task. */
export function latestPlacements(placements: Placement[]): Map<string, Placement> {
  const out = new Map<string, Placement>();
  for (const p of placements) {
    if (p.deleted_at) continue;
    const cur = out.get(p.task_id);
    if (!cur || p.date > cur.date) out.set(p.task_id, p);
  }
  return out;
}

export function isCarryable(task: Task, carryShopping: boolean): boolean {
  if (task.deleted_at || task.status !== "open" || task.backlog || task.parent_id) return false;
  if (task.carry === false) return false;
  if (task.section === "shopping" && !carryShopping) return false;
  return true;
}

/**
 * Bring unfinished tasks forward onto `today`.
 * - Only tasks whose most recent day is before today move; nothing is deleted.
 * - A task removed from its last day (placement.removed) stays off the planner.
 * - Skipped days are not filled in: a task last seen 5 days ago gets one placement today.
 * - Due dates are never touched.
 */
export function rollover(
  today: ISODate,
  tasks: Task[],
  placements: Placement[],
  opts: { carryShopping: boolean; now?: string },
): RolloverResult {
  const latest = latestPlacements(placements);
  const existing = new Set(placements.map((p) => p.id));
  const nextPos = new Map<string, number>();
  for (const p of placements) {
    if (p.date === today && !p.deleted_at) nextPos.set(p.section, Math.max(nextPos.get(p.section) ?? 0, p.position));
  }
  const now = opts.now ?? new Date().toISOString();
  const out: RolloverResult = { placements: [], events: [] };

  const ordered = [...tasks].sort((a, b) => {
    const pa = latest.get(a.id)?.position ?? 0;
    const pb = latest.get(b.id)?.position ?? 0;
    return pa - pb;
  });

  for (const task of ordered) {
    if (!isCarryable(task, opts.carryShopping)) continue;
    const last = latest.get(task.id);
    if (!last || last.removed || last.date >= today) continue;
    const id = placementId(task.id, today);
    if (existing.has(id)) continue;
    const pos = (nextPos.get(task.section) ?? 0) + 1;
    nextPos.set(task.section, pos);
    out.placements.push({
      id,
      task_id: task.id,
      date: today,
      section: task.section,
      position: pos,
      carried: true,
      removed: false,
    });
    out.events.push({
      id: stableId("carried", task.id, today),
      task_id: task.id,
      kind: "carried",
      at: now,
      local_date: today,
      data: { from: last.date, skipped_days: Math.max(0, diffDays(today, last.date) - 1) },
    });
  }
  return out;
}

/** How many times a task has been carried to a new day. */
export function carryCount(taskId: string, placements: Placement[]): number {
  return placements.filter((p) => p.task_id === taskId && p.carried && !p.deleted_at).length;
}

// Recurrence ------------------------------------------------------------------

export function occursOn(rule: RecurrenceRule, start: ISODate, date: ISODate): boolean {
  if (date < start) return false;
  const every = Math.max(1, Math.floor(rule.interval ?? 1));
  const wd = weekdayOf(date);
  switch (rule.freq) {
    case "daily":
      return diffDays(date, start) % every === 0;
    case "weekdays":
      return wd >= 1 && wd <= 5;
    case "weekly": {
      const days = rule.days?.length ? rule.days : [weekdayOf(start)];
      if (!days.includes(wd)) return false;
      const weeks = Math.round(diffDays(startOfWeek(date), startOfWeek(start)) / 7);
      return weeks % every === 0;
    }
    case "monthly": {
      const want = rule.monthDay ?? dayOfMonth(start);
      const dim = daysInMonth(date);
      const hit = dayOfMonth(date) === Math.min(want, dim);
      if (!hit) return false;
      const months =
        (Number(date.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + (Number(date.slice(5, 7)) - Number(start.slice(5, 7)));
      return months % every === 0;
    }
    default:
      return false;
  }
}

export interface OccurrenceResult {
  tasks: Draft<Task>[];
  placements: Draft<Placement>[];
  events: Draft<TaskEvent>[];
}

/**
 * Create today's occurrence of each active recurring task. Missed days are not
 * back-filled, and each occurrence has a deterministic id, so it is created once.
 */
export function generateOccurrences(
  date: ISODate,
  recurrences: Recurrence[],
  existingTaskIds: Set<string>,
  now: string = new Date().toISOString(),
): OccurrenceResult {
  const out: OccurrenceResult = { tasks: [], placements: [], events: [] };
  let pos = 1000;
  for (const r of recurrences) {
    if (r.deleted_at || !r.active) continue;
    if (r.end_date && date > r.end_date) continue;
    if (!occursOn(r.rule, r.start_date, date)) continue;
    const id = occurrenceId(r.id, date);
    if (existingTaskIds.has(id)) continue;
    out.tasks.push({
      id,
      section: r.section,
      title: r.title,
      notes: r.notes,
      priority: r.priority,
      label: r.label,
      due_date: null,
      estimate_min: r.estimate_min,
      actual_min: null,
      scheduled_time: r.scheduled_time,
      parent_id: null,
      status: "open",
      completed_at: null,
      completed_on: null,
      origin_date: date,
      backlog: false,
      carry: r.carry,
      recurrence_id: r.id,
      occurrence_date: date,
      contact_name: null,
      contact_info: null,
      follow_up_date: null,
      quantity: null,
      source: "recurrence",
    });
    out.placements.push({
      id: placementId(id, date),
      task_id: id,
      date,
      section: r.section,
      position: pos++,
      carried: false,
      removed: false,
    });
    out.events.push({
      id: stableId("created", id),
      task_id: id,
      kind: "created",
      at: now,
      local_date: date,
      data: { recurrence_id: r.id },
    });
  }
  return out;
}

export function describeRule(rule: RecurrenceRule): string {
  const every = rule.interval && rule.interval > 1 ? rule.interval : 1;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (rule.freq) {
    case "daily":
      return every === 1 ? "Every day" : `Every ${every} days`;
    case "weekdays":
      return "Every weekday";
    case "weekly":
      return `${every === 1 ? "Weekly" : `Every ${every} weeks`} on ${(rule.days ?? []).map((d) => names[d]).join(", ") || "the same day"}`;
    case "monthly":
      return `${every === 1 ? "Monthly" : `Every ${every} months`} on day ${rule.monthDay ?? "?"}`;
  }
}

export { addDays };
