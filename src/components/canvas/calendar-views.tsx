"use client";

import { Dumbbell, GlassWater, Heart } from "lucide-react";
import { useMemo } from "react";
import { addDays, dateRange, daysInMonth, formatTime, localTimeOf, startOfMonth, startOfWeek, weekdayOf } from "@/lib/canvas/dates";
import { buildIndex, dayStats } from "@/lib/canvas/stats";
import type { ISODate } from "@/lib/canvas/types";
import { Ring } from "./progress";
import { useCanvas } from "./provider";
import { Checkbox, useCompleteTask } from "./tasks";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function useIndex() {
  const { store, rev, prefs } = useCanvas();
  return useMemo(
    () =>
      buildIndex({
        tasks: store.all("canvas_tasks"),
        placements: store.all("canvas_task_placements"),
        exercise: store.all("canvas_exercise"),
        water: store.all("canvas_water"),
        journal: store.all("canvas_journal"),
        ideas: store.all("canvas_ideas"),
        appointments: store.all("canvas_appointments"),
        waterTarget: prefs.water_target,
      }),
    [store, rev, prefs.water_target], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

export function WeekView() {
  const { date, setDate, setView, planner, store, today, rev, prefs } = useCanvas();
  const complete = useCompleteTask();
  const ix = useIndex();
  const weekStart = startOfWeek(date);
  const days = useMemo(() => dateRange(weekStart, addDays(weekStart, 6)), [weekStart]);
  const open = (d: ISODate) => {
    setDate(d);
    setView("day");
  };
  const data = useMemo(
    () =>
      days.map((d) => ({
        d,
        stats: dayStats(ix, d),
        tasks: (["must", "work", "personal", "comms"] as const).flatMap((s) => planner.tasksFor(d, s)),
        appts: [
          ...store.all("canvas_appointments").filter((a) => a.date === d).map((a) => ({ key: a.id, time: a.start_time, title: a.title })),
          ...store.externalEvents(d).map((e) => ({ key: e.key, time: e.allDay ? null : localTimeOf(e.start, prefs.timezone), title: e.title })),
        ].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
      })),
    [days, ix, planner, store, rev, prefs.timezone], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <div className="px-3 py-4 md:px-6">
      <h1 className="dc-serif mb-4 text-2xl">
        Week of {new Date(days[0] + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}
      </h1>
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        {data.map(({ d, stats, tasks, appts }) => (
          <section key={d} className="dc-card" aria-label={d}>
            <button className="flex items-center gap-2 px-3 py-2 text-left" onClick={() => open(d)} style={{ background: d === today ? "var(--dc-paper-2)" : undefined, borderRadius: "9px 9px 0 0" }}>
              <span className="text-xs uppercase tracking-wider" style={{ color: "var(--dc-muted)" }}>
                {WD[weekdayOf(d)]}
              </span>
              <span className="dc-serif text-xl">{Number(d.slice(8))}</span>
              {d === today && <span className="dc-chip">today</span>}
              <span className="ml-auto">
                <Ring value={stats.completionRate} size={24} stroke={3} />
              </span>
            </button>
            {appts.length > 0 && (
              <ul className="px-3 pb-1 text-xs" style={{ color: "var(--dc-muted)" }}>
                {appts.slice(0, 4).map((a) => (
                  <li key={a.key} className="truncate">
                    {a.time ? formatTime(a.time) : "All day"} · {a.title}
                  </li>
                ))}
                {appts.length > 4 && <li>+{appts.length - 4} more</li>}
              </ul>
            )}
            <ul className="dc-ruled border-t" style={{ borderColor: "var(--dc-rule)" }}>
              {tasks.map(({ task, placement }) => (
                <li key={task.id} className={`flex items-center gap-2 pl-3 pr-2 text-sm ${task.status === "done" ? "dc-done" : ""}`}>
                  <Checkbox checked={task.status === "done"} onToggle={() => complete(task)} label={task.title} />
                  <span className="dc-strike min-w-0 flex-1 truncate">{task.title}</span>
                  {placement.section === "must" && <span title="Must do" style={{ color: "#d9a836" }}>★</span>}
                </li>
              ))}
              {!tasks.length && (
                <li className="px-3 text-xs" style={{ color: "var(--dc-faint)", lineHeight: "var(--dc-row)" }}>
                  {d > today ? "Nothing planned yet" : "—"}
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function MonthView() {
  const { date, setDate, setView, today } = useCanvas();
  const ix = useIndex();
  const first = startOfMonth(date);
  const n = daysInMonth(date);
  const lead = (weekdayOf(first) + 6) % 7; // Monday first
  const days = dateRange(first, addDays(first, n - 1));
  return (
    <div className="px-3 py-4 md:px-6">
      <h1 className="dc-serif mb-4 text-2xl">{new Date(first + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h1>
      <div className="dc-sheet overflow-hidden rounded-xl">
        <div className="grid grid-cols-7 text-center text-xs uppercase tracking-wider" style={{ color: "var(--dc-muted)" }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`l${i}`} className="border-t" style={{ borderColor: "var(--dc-rule)" }} />
          ))}
          {days.map((d) => {
            const s = dayStats(ix, d);
            return (
              <button
                key={d}
                className="flex min-h-20 flex-col items-start gap-1 border-l border-t p-1.5 text-left md:min-h-24 md:p-2"
                style={{ borderColor: "var(--dc-rule)", background: d === today ? "var(--dc-paper-2)" : undefined }}
                onClick={() => {
                  setDate(d);
                  setView("day");
                }}
                aria-label={`${d}: ${s.completed} completed${s.exerciseSessions ? ", exercised" : ""}`}
              >
                <span className="flex w-full items-center">
                  <span className="dc-serif text-base md:text-lg">{Number(d.slice(8))}</span>
                  <span className="ml-auto">{s.planned > 0 && <Ring value={s.completionRate} size={20} stroke={2.5} />}</span>
                </span>
                {s.completed > 0 && (
                  <span className="text-[0.68rem]" style={{ color: "var(--dc-muted)" }}>
                    {s.completed} done
                  </span>
                )}
                <span className="mt-auto flex gap-1" style={{ color: "var(--dc-faint)" }}>
                  {s.exerciseSessions > 0 && <Dumbbell size={11} aria-hidden />}
                  {s.waterGoalMet && <GlassWater size={11} aria-hidden />}
                  {s.gratitude > 0 && <Heart size={11} aria-hidden />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
