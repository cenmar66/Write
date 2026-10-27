"use client";

import { ArrowUpRight, ChevronRight, Clock, GripVertical, Link2, MoreHorizontal, Repeat, Star, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatShort, formatTime } from "@/lib/canvas/dates";
import { haptic, penScratch } from "@/lib/canvas/feedback";
import { carryCount } from "@/lib/canvas/planning";
import type { ISODate, Placement, Task, TaskSection } from "@/lib/canvas/types";
import { MicButton } from "./dictation";
import { useCanvas } from "./provider";
import { TaskSheet } from "./task-sheet";

export function Checkbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  const [just, setJust] = useState(false);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className="dc-check-hit"
      onClick={(e) => {
        e.stopPropagation();
        setJust(true);
        setTimeout(() => setJust(false), 350);
        onToggle();
      }}
    >
      <span className="dc-check" data-checked={checked} data-just={just}>
        <svg viewBox="0 0 24 24" aria-hidden>
          {/* A slightly uneven, hand-drawn tick */}
          <path d="M5.2 12.6c1.3 1.1 2.6 2.5 3.7 4.1 2.2-4.1 5.4-7.6 9.6-10.3" />
        </svg>
      </span>
    </button>
  );
}

/** Completion with feedback + undo, shared by every checklist in the planner. */
export function useCompleteTask() {
  const { planner, prefs, toast, date } = useCanvas();
  return (task: Task) => {
    const finishing = task.status !== "done";
    if (finishing) {
      if (prefs.sound) penScratch();
      haptic();
    }
    planner.toggleComplete(task, date);
    if (finishing) {
      toast(`Checked off “${task.title.slice(0, 40)}”`, {
        label: "Undo",
        run: () => {
          const cur = planner.store.get("canvas_tasks", task.id);
          if (cur && cur.status === "done") planner.toggleComplete(cur, date);
        },
      });
    }
  };
}

export function TaskList({
  section,
  date,
  minSlots = 0,
  placeholder = "Add a task…",
  showMeta = true,
  hideDone = false,
}: {
  section: TaskSection;
  date: ISODate;
  minSlots?: number;
  placeholder?: string;
  showMeta?: boolean;
  hideDone?: boolean;
}) {
  const { planner, rev, today } = useCanvas();
  const items = useMemo(() => planner.tasksFor(date, section), [planner, date, section, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const placements = useMemo(() => planner.store.all("canvas_task_placements"), [planner, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = hideDone ? items.filter((i) => i.task.status !== "done") : items;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const move = (from: number, to: number) => {
    const ids = items.map((i) => i.task.id);
    const [x] = ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, x);
    planner.reorder(date, section, ids);
  };

  // Pointer-based drag (works with mouse, touch and Pencil; HTML5 DnD doesn't on iOS).
  const startDrag = (e: React.PointerEvent, idx: number, id: string) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDragId(id);
    const rows = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-task-row]") ?? []);
    const onMove = (ev: PointerEvent) => {
      const rs = rows();
      let target = rs.length;
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) {
          target = i;
          break;
        }
      }
      setOverIdx(target);
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      setOverIdx((t) => {
        if (t !== null && t !== idx && t !== idx + 1) move(idx, t > idx ? t - 1 : t);
        return null;
      });
      setDragId(null);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  const empty = Math.max(0, minSlots - shown.length - 1);
  const isPast = date < today;

  return (
    <ul ref={listRef} className="dc-ruled" aria-label={`${section} tasks`}>
      {shown.map((it, idx) => (
        <TaskRow
          key={it.task.id}
          task={it.task}
          placement={it.placement}
          date={date}
          carried={carryCount(it.task.id, placements)}
          showMeta={showMeta}
          dragging={dragId === it.task.id}
          dropAbove={overIdx === idx && dragId !== null}
          onDragHandle={(e) => startDrag(e, idx, it.task.id)}
          onKeyMove={(dir) => move(idx, idx + dir)}
        />
      ))}
      {overIdx === shown.length && dragId && <li aria-hidden className="dc-drag-over" style={{ minHeight: 2 }} />}
      <AddLine section={section} date={date} placeholder={isPast ? "Add to this past day…" : placeholder} />
      {Array.from({ length: empty }).map((_, i) => (
        <li key={`slot-${i}`} aria-hidden />
      ))}
    </ul>
  );
}

function TaskRow({
  task,
  placement,
  date,
  carried,
  showMeta,
  dragging,
  dropAbove,
  onDragHandle,
  onKeyMove,
  depth = 0,
}: {
  task: Task;
  placement?: Placement;
  date: ISODate;
  carried: number;
  showMeta: boolean;
  dragging?: boolean;
  dropAbove?: boolean;
  onDragHandle?: (e: React.PointerEvent) => void;
  onKeyMove?: (dir: -1 | 1) => void;
  depth?: number;
}) {
  const { planner, rev, today, store } = useCanvas();
  const complete = useCompleteTask();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState(false);
  const subs = useMemo(() => planner.subtasks(task.id), [planner, task.id, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = useMemo(() => store.all("canvas_task_links").some((l) => l.task_id === task.id && l.state !== "broken"), [store, task.id, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = task.status === "done";
  const overdue = task.due_date && task.due_date < date && !done;

  const save = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== task.title) planner.updateTask(task.id, { title: t });
    else setDraft(task.title);
  };

  return (
    <li
      data-task-row
      className={`group ${done ? "dc-done" : ""} ${dropAbove ? "dc-drag-over" : ""}`}
      style={{ opacity: dragging ? 0.45 : 1, paddingLeft: depth ? "1.6rem" : undefined }}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && onKeyMove) {
          e.preventDefault();
          onKeyMove(e.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      <div className="flex min-h-[var(--dc-row)] items-center gap-2 pl-3 pr-1">
        <Checkbox checked={done} onToggle={() => complete(task)} label={`${done ? "Mark not done" : "Mark done"}: ${task.title}`} />
        <div className="min-w-0 flex-1 py-1">
          {editing ? (
            <input
              autoFocus
              className="dc-input text-[0.9rem]"
              value={draft}
              aria-label="Task title"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setDraft(task.title);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button className="block w-full text-left text-[0.9rem] leading-snug" onClick={() => (setDraft(task.title), setEditing(true))} aria-label={`Edit ${task.title}`}>
              <span className="dc-strike">{task.title || <span style={{ color: "var(--dc-faint)" }}>Untitled</span>}</span>
              {task.quantity && <span className="ml-1.5 text-xs" style={{ color: "var(--dc-muted)" }}>× {task.quantity}</span>}
            </button>
          )}
          {showMeta && (
            <Meta task={task} carried={carried} overdue={!!overdue} linked={linked} subs={subs.length} subsDone={subs.filter((s) => s.status === "done").length} open={open} setOpen={setOpen} />
          )}
        </div>
        {task.priority >= 3 && <Star size={14} className="shrink-0" fill="#d9a836" color="#d9a836" aria-label="High priority" />}
        <button className="dc-icon-btn sm dc-noprint opacity-60 group-hover:opacity-100 focus:opacity-100" aria-label={`Details for ${task.title}`} onClick={() => setSheet(true)}>
          <MoreHorizontal size={15} />
        </button>
        {onDragHandle && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Drag to reorder (or Alt+Arrow keys)"
            className="dc-noprint hidden cursor-grab touch-none items-center px-0.5 opacity-0 group-hover:opacity-50 sm:flex"
            onPointerDown={onDragHandle}
          >
            <GripVertical size={14} />
          </span>
        )}
      </div>
      {open && subs.length > 0 && (
        <ul className="pb-1">
          {subs.map((s) => (
            <TaskRow key={s.id} task={s} date={date} carried={0} showMeta={false} depth={1} />
          ))}
        </ul>
      )}
      {sheet && <TaskSheet task={task} date={date} onClose={() => setSheet(false)} />}
      {date < today && done && task.completed_on && task.completed_on !== date && (
        <span className="sr-only">Completed on {task.completed_on}</span>
      )}
    </li>
  );
}

function Meta({
  task,
  carried,
  overdue,
  linked,
  subs,
  subsDone,
  open,
  setOpen,
}: {
  task: Task;
  carried: number;
  overdue: boolean;
  linked: boolean;
  subs: number;
  subsDone: number;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const bits: React.ReactNode[] = [];
  if (task.scheduled_time)
    bits.push(
      <span key="t" className="dc-chip">
        <Clock size={10} /> {formatTime(task.scheduled_time)}
      </span>,
    );
  if (task.contact_name || task.contact_info)
    bits.push(
      <span key="c" className="dc-chip">
        {[task.contact_name, task.contact_info].filter(Boolean).join(" · ")}
      </span>,
    );
  if (task.label) bits.push(<span key="l" className="dc-chip">{task.label}</span>);
  if (task.due_date)
    bits.push(
      <span key="d" className="dc-chip" style={overdue ? { color: "#a3392f", borderColor: "#e3b2aa" } : undefined}>
        Due {formatShort(task.due_date)}
      </span>,
    );
  if (task.follow_up_date) bits.push(<span key="f" className="dc-chip">Follow up {formatShort(task.follow_up_date)}</span>);
  if (task.estimate_min) bits.push(<span key="e" className="dc-chip">{task.estimate_min} min</span>);
  if (carried > 0)
    bits.push(
      <span key="r" className="dc-chip" title={`Carried forward ${carried} time${carried > 1 ? "s" : ""}`}>
        <ArrowUpRight size={10} /> {carried > 1 ? `${carried}×` : "carried"}
      </span>,
    );
  if (task.recurrence_id)
    bits.push(
      <span key="rep" className="dc-chip" title="Repeats">
        <Repeat size={10} />
      </span>,
    );
  if (linked)
    bits.push(
      <span key="g" className="dc-chip" title="Linked to Google Tasks">
        <Link2 size={10} /> Tasks
      </span>,
    );
  if (subs)
    bits.push(
      <button key="s" className="dc-chip" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronRight size={10} style={{ transform: open ? "rotate(90deg)" : "none" }} /> {subsDone}/{subs} steps
      </button>,
    );
  if (task.notes) bits.push(<span key="n" className="truncate text-[0.72rem]" style={{ color: "var(--dc-faint)", maxWidth: "12rem" }}>{task.notes.split("\n")[0]}</span>);
  if (!bits.length) return null;
  return <div className="mt-0.5 flex flex-wrap items-center gap-1">{bits}</div>;
}

export function AddLine({ section, date, placeholder }: { section: TaskSection; date: ISODate; placeholder: string }) {
  const { planner } = useCanvas();
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const add = () => {
    const t = v.trim();
    if (!t) return;
    const extra: Partial<Task> = {};
    if (section === "shopping") {
      const q = t.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
      if (q) {
        extra.quantity = q[1];
        planner.addTask(date, section, q[2], extra);
        setV("");
        return;
      }
    }
    planner.addTask(date, section, t, extra);
    setV("");
    ref.current?.focus();
  };
  return (
    <li className="dc-noprint flex min-h-[var(--dc-row)] items-center gap-2 pl-3 pr-1">
      <span className="h-[1.15rem] w-[1.15rem] shrink-0 rounded border border-dashed" style={{ borderColor: "var(--dc-line)" }} aria-hidden />
      <input
        ref={ref}
        className="dc-input text-[0.9rem]"
        placeholder={placeholder}
        aria-label={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        onBlur={add}
        enterKeyHint="done"
      />
      <MicButton onText={(t) => setV((cur) => (cur ? cur + " " : "") + t)} label="Dictate a task" />
    </li>
  );
}

export function UndoIcon() {
  return <Undo2 size={14} />;
}
