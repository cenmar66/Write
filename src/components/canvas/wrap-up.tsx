"use client";

import { useMemo, useState } from "react";
import { formatShort } from "@/lib/canvas/dates";
import type { ISODate } from "@/lib/canvas/types";
import { useDayProgress } from "./day-view";
import { MicButton } from "./dictation";
import { Ring } from "./progress";
import { useCanvas } from "./provider";
import { Sheet } from "./sheet";

/** Optional evening reflection. Closing the day never requires finishing everything. */
export function WrapUp({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { planner, store, rev, toast } = useCanvas();
  const p = useDayProgress(date);
  const meta = planner.dayMeta(date);
  const [reflection, setReflection] = useState(meta?.reflection ?? "");
  const data = useMemo(() => {
    const tasks = (["must", "work", "personal", "comms"] as const).flatMap((s) => planner.tasksFor(date, s));
    return {
      priorities: tasks.filter((t) => t.placement.section === "must"),
      unfinished: tasks.filter((t) => t.task.status !== "done"),
      good: store.all("canvas_journal").filter((j) => j.date === date),
      ideas: store.all("canvas_ideas").filter((i) => i.date === date),
    };
  }, [planner, store, date, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet
      title={`Wrap up ${formatShort(date)}`}
      onClose={onClose}
      footer={
        <button
          className="dc-btn dc-btn-primary ml-auto"
          onClick={() => {
            planner.closeDay(date, reflection);
            toast(data.unfinished.length ? `Day closed. ${data.unfinished.length} unfinished will carry to tomorrow.` : "Day closed. Rest well.");
            onClose();
          }}
        >
          {meta?.closed_at ? "Save" : "Close the day"}
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Ring value={p.completionRate} size={64} stroke={6}>
            <span className="text-sm font-semibold">{p.completionRate === null ? "—" : `${Math.round(p.completionRate * 100)}%`}</span>
          </Ring>
          <div className="text-sm" style={{ color: "var(--dc-muted)" }}>
            <p>
              <strong style={{ color: "var(--dc-ink)" }}>{p.completed}</strong> tasks completed
            </p>
            <p>
              Priorities: {p.priorityCompleted} of {p.priorityPlanned}
            </p>
            {p.exerciseMinutes > 0 && <p>{p.exerciseMinutes} min of exercise</p>}
            <p>
              Water: {p.waterGlasses}/{p.waterTarget}
            </p>
          </div>
        </div>
        {data.priorities.length > 0 && (
          <Block title="Priorities">
            {data.priorities.map(({ task }) => (
              <li key={task.id}>
                {task.status === "done" ? "✓" : "○"} {task.title}
              </li>
            ))}
          </Block>
        )}
        {data.unfinished.length > 0 && (
          <Block title="Moving to tomorrow">
            {data.unfinished.map(({ task }) => (
              <li key={task.id}>○ {task.title}</li>
            ))}
          </Block>
        )}
        {data.good.length > 0 && (
          <Block title="Good things">
            {data.good.map((g) => (
              <li key={g.id}>• {g.body}</li>
            ))}
          </Block>
        )}
        {data.ideas.length > 0 && (
          <Block title="Ideas captured">
            {data.ideas.map((i) => (
              <li key={i.id}>• {i.body}</li>
            ))}
          </Block>
        )}
        <label className="block">
          <span className="mb-1 flex items-center text-xs font-medium" style={{ color: "var(--dc-muted)" }}>
            A line about today (optional)
            <span className="ml-auto">
              <MicButton onText={(t) => setReflection((r) => (r ? r + " " : "") + t)} />
            </span>
          </span>
          <textarea className="dc-field" rows={3} value={reflection} onChange={(e) => setReflection(e.target.value)} />
        </label>
      </div>
    </Sheet>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dc-muted)" }}>
        {title}
      </p>
      <ul className="space-y-0.5 text-sm">{children}</ul>
    </div>
  );
}
