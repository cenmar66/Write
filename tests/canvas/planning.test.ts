import { describe, expect, it } from "vitest";
import { carryCount, generateOccurrences, occursOn, rollover } from "@/lib/canvas/planning";
import type { Placement, Recurrence } from "@/lib/canvas/types";
import { placed, stamp, task } from "./fixtures";

const opts = { carryShopping: false, now: "2026-10-27T15:00:00Z" };

describe("rollover", () => {
  it("carries unfinished tasks to today and leaves finished ones", () => {
    const tasks = [task("a"), task("b", { status: "done", completed_on: "2026-10-26" })];
    const placements = [placed("a", "2026-10-26"), placed("b", "2026-10-26")];
    const r = rollover("2026-10-27", tasks, placements, opts);
    expect(r.placements.map((p) => p.task_id)).toEqual(["a"]);
    expect(r.placements[0]).toMatchObject({ date: "2026-10-27", carried: true });
    expect(r.events[0]).toMatchObject({ kind: "carried", task_id: "a" });
  });

  it("is idempotent: running twice adds nothing the second time", () => {
    const tasks = [task("a")];
    const placements: Placement[] = [placed("a", "2026-10-26")];
    const first = rollover("2026-10-27", tasks, placements, opts);
    const after = [...placements, ...first.placements.map((p) => stamp(p))];
    expect(rollover("2026-10-27", tasks, after, opts).placements).toHaveLength(0);
  });

  it("two devices compute the same placement id (no duplicates on sync)", () => {
    const tasks = [task("a")];
    const placements = [placed("a", "2026-10-26")];
    const d1 = rollover("2026-10-27", tasks, placements, opts);
    const d2 = rollover("2026-10-27", tasks, placements, { ...opts, now: "2026-10-27T18:00:00Z" });
    expect(d1.placements[0].id).toBe(d2.placements[0].id);
    expect(d1.events[0].id).toBe(d2.events[0].id);
  });

  it("after several inactive days, adds exactly one placement for today", () => {
    const r = rollover("2026-10-27", [task("a")], [placed("a", "2026-10-20")], opts);
    expect(r.placements).toHaveLength(1);
    expect(r.events[0].data).toMatchObject({ from: "2026-10-20", skipped_days: 6 });
  });

  it("does not touch due dates, backlog, removed, archived, or deleted tasks", () => {
    const tasks = [
      task("due", { due_date: "2026-10-25" }),
      task("backlog", { backlog: true }),
      task("removed"),
      task("archived", { status: "archived" }),
      task("deleted", { deleted_at: "2026-10-26T00:00:00Z" }),
      task("sub", { parent_id: "due" }),
    ];
    const placements = [
      placed("due", "2026-10-26"),
      placed("backlog", "2026-10-26"),
      placed("removed", "2026-10-26", { removed: true }),
      placed("archived", "2026-10-26"),
      placed("deleted", "2026-10-26"),
      placed("sub", "2026-10-26"),
    ];
    const r = rollover("2026-10-27", tasks, placements, opts);
    expect(r.placements.map((p) => p.task_id)).toEqual(["due"]);
    expect(tasks[0].due_date).toBe("2026-10-25");
  });

  it("does not carry tasks already planned for the future, nor shopping unless enabled", () => {
    const tasks = [task("future"), task("milk", { section: "shopping" })];
    const placements = [placed("future", "2026-10-29"), placed("milk", "2026-10-26", { section: "shopping" })];
    expect(rollover("2026-10-27", tasks, placements, opts).placements).toHaveLength(0);
    expect(rollover("2026-10-27", tasks, placements, { ...opts, carryShopping: true }).placements.map((p) => p.task_id)).toEqual(["milk"]);
  });

  it("counts how many times a task has been carried", () => {
    const ps = [placed("a", "2026-10-25"), placed("a", "2026-10-26", { carried: true }), placed("a", "2026-10-27", { carried: true })];
    expect(carryCount("a", ps)).toBe(2);
  });
});

const rec = (over: Partial<Recurrence>): Recurrence =>
  stamp({
    id: "r1",
    section: "personal",
    title: "Stretch",
    notes: "",
    priority: 0,
    label: null,
    estimate_min: null,
    scheduled_time: null,
    rule: { freq: "daily" },
    start_date: "2026-10-01",
    end_date: null,
    carry: false,
    active: true,
    ...over,
  }) as Recurrence;

describe("recurrence", () => {
  it("matches daily, weekday, weekly, and monthly rules", () => {
    expect(occursOn({ freq: "daily", interval: 2 }, "2026-10-01", "2026-10-03")).toBe(true);
    expect(occursOn({ freq: "daily", interval: 2 }, "2026-10-01", "2026-10-04")).toBe(false);
    expect(occursOn({ freq: "weekdays" }, "2026-10-01", "2026-10-31")).toBe(false); // Saturday
    expect(occursOn({ freq: "weekly", days: [2, 4] }, "2026-10-01", "2026-10-27")).toBe(true); // Tuesday
    expect(occursOn({ freq: "monthly", monthDay: 31 }, "2026-10-01", "2026-11-30")).toBe(true); // last day fallback
    expect(occursOn({ freq: "daily" }, "2026-10-01", "2026-09-30")).toBe(false);
  });

  it("creates one occurrence per day, once", () => {
    const first = generateOccurrences("2026-10-27", [rec({})], new Set());
    expect(first.tasks).toHaveLength(1);
    const again = generateOccurrences("2026-10-27", [rec({})], new Set(first.tasks.map((t) => t.id)));
    expect(again.tasks).toHaveLength(0);
    const tomorrow = generateOccurrences("2026-10-28", [rec({})], new Set(first.tasks.map((t) => t.id)));
    expect(tomorrow.tasks[0].id).not.toBe(first.tasks[0].id);
  });

  it("skips inactive or ended recurrences", () => {
    expect(generateOccurrences("2026-10-27", [rec({ active: false })], new Set()).tasks).toHaveLength(0);
    expect(generateOccurrences("2026-10-27", [rec({ end_date: "2026-10-20" })], new Set()).tasks).toHaveLength(0);
  });
});
