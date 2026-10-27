// Productivity statistics. Every metric is defined here in one place and documented in
// docs/canvas/STATISTICS.md. Rules that keep the numbers honest:
//  * A task counts as "planned" on a day if it had a (not removed) placement that day.
//    Carrying a task forward makes it planned again, but never "created" again.
//  * "Completed on D" uses the task's current state (completed_on = D). Reopening a task
//    clears it, so a reopened task stops counting; the event ledger keeps the history.
//  * A task completes at most once, on one day, however many days it appeared on.
//  * Each recurring occurrence is its own task, so it counts once per occurrence.
//  * Days with nothing planned have no completion rate (null), so rest days aren't zeros.

import { addDays, dateRange, diffDays, weekdayOf } from "./dates";
import type {
  Appointment,
  Exercise,
  Idea,
  ISODate,
  JournalEntry,
  Placement,
  Task,
  TaskEvent,
  TaskSection,
  Water,
} from "./types";

export const STAT_SECTIONS: TaskSection[] = ["must", "work", "personal", "comms"];

export interface StatsInput {
  tasks: Task[];
  placements: Placement[];
  events?: TaskEvent[];
  appointments?: Appointment[];
  externalEventCounts?: Record<ISODate, number>;
  exercise?: Exercise[];
  water?: Water[];
  journal?: JournalEntry[];
  ideas?: Idea[];
  waterTarget?: number;
}

export interface DayStats {
  date: ISODate;
  created: number;
  planned: number;
  completed: number;
  completedPlanned: number;
  completionRate: number | null;
  priorityPlanned: number;
  priorityCompleted: number;
  priorityRate: number | null;
  allPrioritiesDone: boolean;
  workCompleted: number;
  personalCompleted: number;
  commsCompleted: number;
  carried: number;
  overdue: number;
  appointments: number;
  exerciseSessions: number;
  exerciseMinutes: number;
  waterGlasses: number;
  waterTarget: number;
  waterGoalMet: boolean;
  gratitude: number;
  ideas: number;
  bought: number;
  estimatedMin: number;
  actualMin: number;
}

export interface StatsIndex {
  input: StatsInput;
  tasks: Map<string, Task>;
  placementsByDate: Map<ISODate, Placement[]>;
  completedByDate: Map<ISODate, Task[]>;
  createdByDate: Map<ISODate, number>;
}

const live = <T extends { deleted_at: string | null }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !x.deleted_at);

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export function buildIndex(input: StatsInput): StatsIndex {
  const tasks = new Map<string, Task>();
  const completedByDate = new Map<ISODate, Task[]>();
  const createdByDate = new Map<ISODate, number>();
  for (const t of live(input.tasks)) {
    if (t.parent_id) continue; // subtasks are steps, not tasks of their own
    tasks.set(t.id, t);
    if (t.status === "done" && t.completed_on) push(completedByDate, t.completed_on, t);
    if (STAT_SECTIONS.includes(t.section)) createdByDate.set(t.origin_date, (createdByDate.get(t.origin_date) ?? 0) + 1);
  }
  const placementsByDate = new Map<ISODate, Placement[]>();
  const seen = new Set<string>();
  for (const p of live(input.placements)) {
    if (p.removed || !tasks.has(p.task_id)) continue;
    const key = p.task_id + p.date;
    if (seen.has(key)) continue; // defensive: one appearance per task per day
    seen.add(key);
    push(placementsByDate, p.date, p);
  }
  return { input, tasks, placementsByDate, completedByDate, createdByDate };
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function dayStats(ix: StatsIndex, date: ISODate): DayStats {
  const { input } = ix;
  const placed = (ix.placementsByDate.get(date) ?? []).filter((p) => {
    const t = ix.tasks.get(p.task_id)!;
    return STAT_SECTIONS.includes(t.section);
  });
  const doneOn = (t: Task) => t.status === "done" && t.completed_on === date;
  let completedPlanned = 0;
  let priorityPlanned = 0;
  let priorityCompleted = 0;
  let carried = 0;
  let overdue = 0;
  for (const p of placed) {
    const t = ix.tasks.get(p.task_id)!;
    const done = doneOn(t);
    if (done) completedPlanned++;
    if (p.section === "must") {
      priorityPlanned++;
      if (done) priorityCompleted++;
    }
    if (p.carried) carried++;
    const finishedByThen = t.status === "done" && t.completed_on && t.completed_on <= date;
    if (t.due_date && t.due_date < date && !finishedByThen) overdue++;
  }
  const completedAll = (ix.completedByDate.get(date) ?? []).filter((t) => STAT_SECTIONS.includes(t.section));
  const bySection = (s: TaskSection) => completedAll.filter((t) => t.section === s).length;
  const ex = live(input.exercise).filter((e) => e.date === date);
  const water = live(input.water).find((w) => w.date === date);
  const target = water?.target ?? input.waterTarget ?? 8;
  const glasses = water?.glasses ?? 0;

  return {
    date,
    created: ix.createdByDate.get(date) ?? 0,
    planned: placed.length,
    completed: completedAll.length,
    completedPlanned,
    completionRate: ratio(completedPlanned, placed.length),
    priorityPlanned,
    priorityCompleted,
    priorityRate: ratio(priorityCompleted, priorityPlanned),
    allPrioritiesDone: priorityPlanned > 0 && priorityCompleted === priorityPlanned,
    workCompleted: bySection("work"),
    personalCompleted: bySection("personal"),
    commsCompleted: bySection("comms"),
    carried,
    overdue,
    appointments:
      live(input.appointments).filter((a) => a.date === date).length + (input.externalEventCounts?.[date] ?? 0),
    exerciseSessions: ex.length,
    exerciseMinutes: ex.reduce((s, e) => s + (e.duration_min ?? 0), 0),
    waterGlasses: glasses,
    waterTarget: target,
    waterGoalMet: glasses >= target,
    gratitude: live(input.journal).filter((j) => j.date === date && j.body.trim()).length,
    ideas: live(input.ideas).filter((i) => i.date === date && i.body.trim()).length,
    bought: (ix.completedByDate.get(date) ?? []).filter((t) => t.section === "shopping").length,
    estimatedMin: completedAll.reduce((s, t) => s + (t.estimate_min ?? 0), 0),
    actualMin: completedAll.reduce((s, t) => s + (t.actual_min ?? 0), 0),
  };
}

export interface PeriodStats {
  from: ISODate;
  to: ISODate;
  days: DayStats[];
  totalCompleted: number;
  totalPlanned: number;
  avgCompletionRate: number | null; // mean of daily rates over days that had a plan
  overallCompletionRate: number | null; // completed-planned / planned, pooled
  priorityDays: number; // days with priorities planned
  priorityPerfectDays: number; // ... where every priority was finished
  priorityRate: number | null;
  carriedTotal: number;
  exerciseDays: number;
  exerciseMinutes: number;
  waterGoalDays: number;
  waterTrackedDays: number;
  gratitude: number;
  ideas: number;
  workCompleted: number;
  personalCompleted: number;
  commsCompleted: number;
  byWeekday: { weekday: number; completed: number; days: number }[];
}

export function periodStats(ix: StatsIndex, from: ISODate, to: ISODate): PeriodStats {
  const days = dateRange(from, to).map((d) => dayStats(ix, d));
  const rated = days.filter((d) => d.completionRate !== null);
  const sum = (f: (d: DayStats) => number) => days.reduce((s, d) => s + f(d), 0);
  const prioDays = days.filter((d) => d.priorityPlanned > 0);
  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, completed: 0, days: 0 }));
  for (const d of days) {
    const w = byWeekday[weekdayOf(d.date)];
    w.completed += d.completed;
    w.days += 1;
  }
  const waterIx = new Set(live(ix.input.water).map((w) => w.date));
  return {
    from,
    to,
    days,
    totalCompleted: sum((d) => d.completed),
    totalPlanned: sum((d) => d.planned),
    avgCompletionRate: rated.length ? rated.reduce((s, d) => s + (d.completionRate ?? 0), 0) / rated.length : null,
    overallCompletionRate: ratio(sum((d) => d.completedPlanned), sum((d) => d.planned)),
    priorityDays: prioDays.length,
    priorityPerfectDays: prioDays.filter((d) => d.allPrioritiesDone).length,
    priorityRate: ratio(sum((d) => d.priorityCompleted), sum((d) => d.priorityPlanned)),
    carriedTotal: sum((d) => d.carried),
    exerciseDays: days.filter((d) => d.exerciseSessions > 0).length,
    exerciseMinutes: sum((d) => d.exerciseMinutes),
    waterGoalDays: days.filter((d) => d.waterGoalMet && waterIx.has(d.date)).length,
    waterTrackedDays: days.filter((d) => waterIx.has(d.date)).length,
    gratitude: sum((d) => d.gratitude),
    ideas: sum((d) => d.ideas),
    workCompleted: sum((d) => d.workCompleted),
    personalCompleted: sum((d) => d.personalCompleted),
    commsCompleted: sum((d) => d.commsCompleted),
    byWeekday,
  };
}

/** Open tasks that have been waiting the longest. */
export function longestUnfinished(ix: StatsIndex, today: ISODate, limit = 5) {
  return [...ix.tasks.values()]
    .filter((t) => t.status === "open" && STAT_SECTIONS.includes(t.section))
    .map((t) => ({ task: t, ageDays: diffDays(today, t.origin_date) }))
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, limit);
}

/** Tasks carried forward most often (still open or not). */
export function mostPostponed(ix: StatsIndex, limit = 5) {
  const counts = new Map<string, number>();
  for (const list of ix.placementsByDate.values())
    for (const p of list) if (p.carried) counts.set(p.task_id, (counts.get(p.task_id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, carried]) => ({ task: ix.tasks.get(id)!, carried }))
    .filter((x) => x.task && x.carried > 0)
    .sort((a, b) => b.carried - a.carried)
    .slice(0, limit);
}

/** Completed counts for this 30 days vs the 30 before. */
export function rollingComparison(ix: StatsIndex, today: ISODate) {
  const cur = periodStats(ix, addDays(today, -29), today);
  const prev = periodStats(ix, addDays(today, -59), addDays(today, -30));
  return { current: cur, previous: prev };
}

/** Recurring tasks: how often each one got done. */
export function recurringHabits(ix: StatsIndex, from: ISODate, to: ISODate) {
  const by = new Map<string, { title: string; due: number; done: number }>();
  for (const t of ix.tasks.values()) {
    if (!t.recurrence_id || !t.occurrence_date || t.occurrence_date < from || t.occurrence_date > to) continue;
    const e = by.get(t.recurrence_id) ?? { title: t.title, due: 0, done: 0 };
    e.due++;
    if (t.status === "done") e.done++;
    by.set(t.recurrence_id, e);
  }
  return [...by.entries()].map(([id, v]) => ({ id, ...v, rate: v.due ? v.done / v.due : 0 }));
}

/** When was a task completed / reopened, from the ledger (oldest first). */
export function taskHistory(events: TaskEvent[], taskId: string) {
  return live(events)
    .filter((e) => e.task_id === taskId)
    .sort((a, b) => a.at.localeCompare(b.at));
}
