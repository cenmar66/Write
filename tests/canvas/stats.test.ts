import { describe, expect, it } from "vitest";
import { buildIndex, dayStats, mostPostponed, periodStats, recurringHabits } from "@/lib/canvas/stats";
import { placed, task } from "./fixtures";

describe("statistics", () => {
  it("rollover does not inflate created counts or double-count completion", () => {
    const tasks = [task("a", { origin_date: "2026-10-25", status: "done", completed_on: "2026-10-27" })];
    const placements = [
      placed("a", "2026-10-25"),
      placed("a", "2026-10-26", { carried: true }),
      placed("a", "2026-10-27", { carried: true }),
    ];
    const ix = buildIndex({ tasks, placements });
    expect(dayStats(ix, "2026-10-25").created).toBe(1);
    expect(dayStats(ix, "2026-10-26").created).toBe(0);
    expect(dayStats(ix, "2026-10-26").completionRate).toBe(0);
    expect(dayStats(ix, "2026-10-27")).toMatchObject({ completed: 1, completionRate: 1, carried: 1 });
    expect(periodStats(ix, "2026-10-25", "2026-10-27").totalCompleted).toBe(1);
  });

  it("a reopened task stops counting as completed", () => {
    const tasks = [task("a", { origin_date: "2026-10-27", status: "open", completed_on: null })];
    const ix = buildIndex({ tasks, placements: [placed("a", "2026-10-27")] });
    expect(dayStats(ix, "2026-10-27")).toMatchObject({ completed: 0, planned: 1, completionRate: 0 });
  });

  it("days with nothing planned have no rate (rest days are not zeros)", () => {
    const ix = buildIndex({ tasks: [], placements: [] });
    expect(dayStats(ix, "2026-10-27").completionRate).toBeNull();
    expect(periodStats(ix, "2026-10-21", "2026-10-27").avgCompletionRate).toBeNull();
  });

  it("tracks priorities, sections, overdue, shopping separately", () => {
    const d = "2026-10-27";
    const tasks = [
      task("m1", { section: "must", origin_date: d, status: "done", completed_on: d }),
      task("m2", { section: "must", origin_date: d }),
      task("w", { section: "work", origin_date: d, status: "done", completed_on: d }),
      task("late", { section: "personal", origin_date: "2026-10-20", due_date: "2026-10-26" }),
      task("milk", { section: "shopping", origin_date: d, status: "done", completed_on: d }),
    ];
    const placements = [
      placed("m1", d, { section: "must" }),
      placed("m2", d, { section: "must" }),
      placed("w", d),
      placed("late", d, { section: "personal", carried: true }),
      placed("milk", d, { section: "shopping" }),
    ];
    const s = dayStats(buildIndex({ tasks, placements }), d);
    expect(s).toMatchObject({
      created: 3,
      planned: 4,
      completed: 2,
      priorityPlanned: 2,
      priorityCompleted: 1,
      allPrioritiesDone: false,
      workCompleted: 1,
      overdue: 1,
      bought: 1,
    });
    expect(s.completionRate).toBe(0.5);
  });

  it("counts recurring occurrences individually", () => {
    const tasks = [
      task("o1", { recurrence_id: "r", occurrence_date: "2026-10-26", status: "done", completed_on: "2026-10-26" }),
      task("o2", { recurrence_id: "r", occurrence_date: "2026-10-27" }),
    ];
    const ix = buildIndex({ tasks, placements: [placed("o1", "2026-10-26"), placed("o2", "2026-10-27")] });
    expect(recurringHabits(ix, "2026-10-01", "2026-10-31")[0]).toMatchObject({ due: 2, done: 1, rate: 0.5 });
  });

  it("finds the most postponed tasks", () => {
    const tasks = [task("a"), task("b")];
    const placements = [placed("a", "2026-10-26", { carried: true }), placed("a", "2026-10-27", { carried: true }), placed("b", "2026-10-27", { carried: true })];
    expect(mostPostponed(buildIndex({ tasks, placements }))[0]).toMatchObject({ carried: 2 });
  });
});
