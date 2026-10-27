"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { sectionColor } from "@/lib/canvas/colors";
import { addDays, dateRange, formatShort, startOfMonth, startOfWeek, daysInMonth, weekdayOf } from "@/lib/canvas/dates";
import {
  buildIndex,
  dayStats,
  longestUnfinished,
  mostPostponed,
  periodStats,
  recurringHabits,
  rollingComparison,
  type DayStats,
} from "@/lib/canvas/stats";
import type { TaskSection } from "@/lib/canvas/types";
import { Bars, HabitGrid, Line, SplitBar } from "./charts";
import { Ring } from "./progress";
import { useCanvas } from "./provider";

type Range = "day" | "week" | "month";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function Insights() {
  const { store, rev, prefs, today } = useCanvas();
  const [range, setRange] = useState<Range>("week");
  const [anchor, setAnchor] = useState(today);
  const [cat, setCat] = useState<"all" | TaskSection>("all");
  const color = (k: Parameters<typeof sectionColor>[0]) => sectionColor(k, prefs.section_colors, prefs.color_theme);

  const ix = useMemo(() => {
    const tasks = store.all("canvas_tasks").filter((t) => cat === "all" || t.section === cat);
    const ids = new Set(tasks.map((t) => t.id));
    const extCounts: Record<string, number> = {};
    for (const e of store.externalEvents()) extCounts[e.date] = (extCounts[e.date] ?? 0) + 1;
    return buildIndex({
      tasks,
      placements: store.all("canvas_task_placements").filter((p) => ids.has(p.task_id)),
      appointments: store.all("canvas_appointments"),
      externalEventCounts: extCounts,
      exercise: store.all("canvas_exercise"),
      water: store.all("canvas_water"),
      journal: store.all("canvas_journal"),
      ideas: store.all("canvas_ideas"),
      waterTarget: prefs.water_target,
    });
  }, [store, rev, cat, prefs.water_target]); // eslint-disable-line react-hooks/exhaustive-deps

  const from = range === "day" ? anchor : range === "week" ? startOfWeek(anchor) : startOfMonth(anchor);
  const to = range === "day" ? anchor : range === "week" ? addDays(from, 6) : addDays(from, daysInMonth(anchor) - 1);
  const step = (dir: 1 | -1) => {
    if (range === "day") setAnchor(addDays(anchor, dir));
    else if (range === "week") setAnchor(addDays(anchor, 7 * dir));
    else {
      const d = new Date(from + "T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + dir);
      setAnchor(d.toISOString().slice(0, 10));
    }
  };
  const label =
    range === "day"
      ? formatShort(from)
      : range === "week"
        ? `${formatShort(from)} – ${formatShort(to)}`
        : new Date(from + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 md:px-6">
      <h1 className="dc-serif mb-1 text-3xl">Your progress</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--dc-muted)" }}>
        Quietly counted as you go. Rest days are just rest days — they don&apos;t pull anything down.
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="dc-seg" role="group" aria-label="Range">
          {(["day", "week", "month"] as Range[]).map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
              {r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <button className="dc-icon-btn" aria-label="Previous" onClick={() => step(-1)}>
          <ChevronLeft size={18} />
        </button>
        <span className="min-w-36 text-center text-sm font-medium">{label}</span>
        <button className="dc-icon-btn" aria-label="Next" onClick={() => step(1)} disabled={to >= today}>
          <ChevronRight size={18} />
        </button>
        <select className="dc-field ml-auto w-auto py-1.5 text-sm" value={cat} onChange={(e) => setCat(e.target.value as typeof cat)} aria-label="Category">
          <option value="all">All tasks</option>
          <option value="must">Must Do</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="comms">Emails / Calls</option>
        </select>
      </div>

      {range === "day" ? <DayPanel s={dayStats(ix, anchor)} /> : <PeriodPanel ix={ix} from={from} to={to} range={range} color={color} today={today} />}

      <details className="mt-8 text-sm" style={{ color: "var(--dc-muted)" }}>
        <summary className="cursor-pointer font-medium">How these numbers are counted</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>Planned</b>: tasks on that day&apos;s page (Must Do, Work, Personal, Emails/Calls). A task carried to the next day is planned again there, but it is never &quot;created&quot; twice.
          </li>
          <li>
            <b>Completion rate</b>: planned tasks finished that day ÷ planned tasks that day. Days with nothing planned have no rate (shown as —), so rest days don&apos;t count as zeros. Weekly &quot;average&quot; is the mean of the days that had a plan.
          </li>
          <li>
            <b>Completed</b>: tasks whose finish date is that day. A task finishes once, however many days it appeared on. Reopening a task removes it from the count; the full history stays in the task&apos;s log.
          </li>
          <li>
            <b>Priorities</b>: tasks in Must Do on that day. A &quot;perfect priority day&quot; finished all of them.
          </li>
          <li>
            <b>Carried</b>: tasks that moved forward to that day unfinished. <b>Overdue</b>: planned tasks past their due date and not finished by that day.
          </li>
          <li>
            <b>Repeating tasks</b>: each day&apos;s copy counts once. To Buy items and sub-steps aren&apos;t counted as tasks.
          </li>
          <li>
            <b>Water goal</b>: met when glasses ≥ that day&apos;s target. <b>Appointments</b> include cached Google Calendar events.
          </li>
        </ul>
      </details>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="dc-card p-3">
      <p className="text-xs" style={{ color: "var(--dc-muted)" }}>
        {label}
      </p>
      <p className="dc-serif mt-0.5 text-2xl">{value}</p>
      {sub && (
        <p className="text-xs" style={{ color: "var(--dc-faint)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dc-card p-4 ${className}`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dc-muted)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function DayPanel({ s }: { s: DayStats }) {
  return (
    <div className="space-y-4">
      <div className="dc-card flex flex-wrap items-center gap-6 p-5">
        <Ring value={s.completionRate} size={110} stroke={10}>
          <span className="dc-serif text-2xl">{pct(s.completionRate)}</span>
        </Ring>
        <div>
          <p className="dc-serif text-xl">Daily completion</p>
          <p className="text-sm" style={{ color: "var(--dc-muted)" }}>
            {s.completedPlanned} of {s.planned} planned tasks · {s.priorityCompleted}/{s.priorityPlanned} priorities
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tasks created" value={s.created} />
        <Stat label="Tasks completed" value={s.completed} />
        <Stat label="Priorities done" value={`${s.priorityCompleted}/${s.priorityPlanned}`} />
        <Stat label="Work · Personal" value={`${s.workCompleted} · ${s.personalCompleted}`} />
        <Stat label="Carried forward" value={s.carried} />
        <Stat label="Overdue" value={s.overdue} />
        <Stat label="Appointments" value={s.appointments} />
        <Stat label="Exercise" value={`${s.exerciseMinutes} min`} sub={`${s.exerciseSessions} session${s.exerciseSessions === 1 ? "" : "s"}`} />
        <Stat label="Water" value={`${s.waterGlasses}/${s.waterTarget}`} />
        <Stat label="Good things" value={s.gratitude} />
        <Stat label="Ideas" value={s.ideas} />
        {(s.estimatedMin > 0 || s.actualMin > 0) && <Stat label="Planned vs actual" value={`${s.estimatedMin} / ${s.actualMin} min`} sub="for finished tasks with times" />}
      </div>
    </div>
  );
}

function PeriodPanel({ ix, from, to, range, color, today }: { ix: ReturnType<typeof buildIndex>; from: string; to: string; range: Range; color: (k: "must" | "work" | "personal" | "comms" | "exercise" | "water" | "journal") => string; today: string }) {
  const p = useMemo(() => periodStats(ix, from, to), [ix, from, to]);
  const upTo = p.days.filter((d) => d.date <= today);
  const roll = useMemo(() => rollingComparison(ix, today), [ix, today]);
  const habits = useMemo(() => recurringHabits(ix, from, to), [ix, from, to]);
  const best = [...p.byWeekday].filter((w) => w.days > 0).sort((a, b) => b.completed / b.days - a.completed / a.days)[0];
  const short = range === "week" ? (d: string) => WD[weekdayOf(d)].slice(0, 1) : (d: string) => (Number(d.slice(8)) % 5 === 1 ? String(Number(d.slice(8))) : "");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tasks completed" value={p.totalCompleted} />
        <Stat label="Average daily completion" value={pct(p.avgCompletionRate)} sub="over days with a plan" />
        <Stat label="Priority days all done" value={`${p.priorityPerfectDays}/${p.priorityDays}`} sub={`${pct(p.priorityRate)} of priorities finished`} />
        <Stat label="Carried forward" value={p.carriedTotal} />
        <Stat label="Exercise" value={`${p.exerciseDays} days`} sub={`${p.exerciseMinutes} min total`} />
        <Stat label="Water goal met" value={`${p.waterGoalDays}/${p.waterTrackedDays}`} sub="days tracked" />
        <Stat label="Good things" value={p.gratitude} />
        <Stat label="Ideas captured" value={p.ideas} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Daily completion">
          <Bars data={p.days.map((d) => ({ label: short(d.date), title: d.date, value: d.date <= today ? d.completionRate : null }))} max={1} format={(v) => pct(v)} color={color("must")} />
        </Panel>
        <Panel title="Completed and carried">
          <Line
            series={[
              { name: "Completed", color: color("must"), values: p.days.map((d) => (d.date <= today ? d.completed : null)) },
              { name: "Carried", color: "#c39a4e", values: p.days.map((d) => (d.date <= today ? d.carried : null)) },
            ]}
          />
        </Panel>
        <Panel title="By category">
          <SplitBar
            parts={[
              { name: "Must Do", value: p.days.reduce((n, d) => n + d.priorityCompleted, 0), color: color("must") },
              { name: "Work", value: p.workCompleted, color: color("work") },
              { name: "Personal", value: p.personalCompleted, color: color("personal") },
              { name: "Emails / Calls", value: p.commsCompleted, color: color("comms") },
            ]}
          />
          {best && (
            <p className="mt-3 text-sm" style={{ color: "var(--dc-muted)" }}>
              Most productive day: <b>{WD[best.weekday]}</b> ({(best.completed / best.days).toFixed(1)} tasks on average)
            </p>
          )}
        </Panel>
        <Panel title="Habits">
          <HabitGrid
            days={upTo.map((d) => d.date)}
            rows={[
              { name: "Exercise", color: color("exercise"), values: upTo.map((d) => d.exerciseSessions > 0) },
              { name: "Water goal", color: color("water"), values: upTo.map((d) => d.waterGoalMet) },
              { name: "Good things", color: color("journal"), values: upTo.map((d) => d.gratitude > 0) },
              { name: "Priorities done", color: color("must"), values: upTo.map((d) => d.allPrioritiesDone) },
            ]}
          />
        </Panel>
      </div>

      {range === "month" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Last 30 days vs the 30 before">
            <p className="text-sm">
              <b className="dc-serif text-2xl">{roll.current.totalCompleted}</b> completed{" "}
              <span style={{ color: "var(--dc-muted)" }}>
                (before: {roll.previous.totalCompleted}) · average completion {pct(roll.current.avgCompletionRate)} (before: {pct(roll.previous.avgCompletionRate)})
              </span>
            </p>
          </Panel>
          {habits.length > 0 && (
            <Panel title="Repeating tasks">
              <ul className="space-y-1 text-sm">
                {habits.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span className="truncate">{h.title}</span>
                    <span style={{ color: "var(--dc-muted)" }}>
                      {h.done}/{h.due}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Waiting the longest">
          <ul className="space-y-1 text-sm">
            {longestUnfinished(ix, today).map(({ task, ageDays }) => (
              <li key={task.id} className="flex justify-between gap-2">
                <span className="truncate">{task.title}</span>
                <span style={{ color: "var(--dc-muted)" }}>{ageDays} days</span>
              </li>
            ))}
            {!longestUnfinished(ix, today).length && <li style={{ color: "var(--dc-faint)" }}>Nothing waiting.</li>}
          </ul>
        </Panel>
        <Panel title="Most often postponed">
          <ul className="space-y-1 text-sm">
            {mostPostponed(ix).map(({ task, carried }) => (
              <li key={task.id} className="flex justify-between gap-2">
                <span className={`truncate ${task.status === "done" ? "line-through opacity-60" : ""}`}>{task.title}</span>
                <span style={{ color: "var(--dc-muted)" }}>moved {carried}×</span>
              </li>
            ))}
            {!mostPostponed(ix).length && <li style={{ color: "var(--dc-faint)" }}>Nothing postponed.</li>}
          </ul>
        </Panel>
      </div>
      <span className="hidden">{dateRange(from, to).length}</span>
    </div>
  );
}
