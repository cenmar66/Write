"use client";

import { Archive, CalendarArrowUp, Inbox, Link2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, formatShort } from "@/lib/canvas/dates";
import { describeRule } from "@/lib/canvas/planning";
import { TASK_SECTION_TITLES } from "@/lib/canvas/sections";
import { newId } from "@/lib/canvas/ids";
import type { ISODate, RecurrenceRule, Task, TaskSection } from "@/lib/canvas/types";
import { MicButton } from "./dictation";
import { useCanvas } from "./provider";
import { Field, Sheet } from "./sheet";
import { Checkbox, useCompleteTask } from "./tasks";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function TaskSheet({ task: initial, date, onClose }: { task: Task; date: ISODate; onClose: () => void }) {
  const { planner, rev, store, toast, today, mode } = useCanvas();
  const task = useMemo(() => store.get("canvas_tasks", initial.id) ?? initial, [store, initial, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const subs = useMemo(() => planner.subtasks(task.id), [planner, task.id, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => store.all("canvas_task_events").filter((e) => e.task_id === task.id).sort((a, b) => a.at.localeCompare(b.at)), [store, task.id, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const recurrence = task.recurrence_id ? store.get("canvas_recurrences", task.recurrence_id) : undefined;
  const link = useMemo(() => store.all("canvas_task_links").find((l) => l.task_id === task.id), [store, task.id, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const complete = useCompleteTask();
  const [notes, setNotes] = useState(task.notes);
  const [title, setTitle] = useState(task.title);
  const [sub, setSub] = useState("");
  const [moveDate, setMoveDate] = useState(addDays(date, 1));
  const set = (p: Partial<Task>) => planner.updateTask(task.id, p);
  const numOrNull = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v))) || null);

  const setRule = (rule: RecurrenceRule | null) => {
    if (!rule) {
      if (task.recurrence_id) planner.stopRecurring(task.recurrence_id);
      return;
    }
    planner.makeRecurring(task, rule, date);
  };

  const saveText = () => {
    const patch: Partial<Task> = {};
    if (title.trim() && title !== task.title) patch.title = title.trim();
    if (notes !== task.notes) patch.notes = notes;
    if (Object.keys(patch).length) set(patch);
  };

  const close = () => {
    saveText();
    onClose();
  };

  return (
    <Sheet
      title="Task details"
      onClose={close}
      footer={
        <>
          <button
            className="dc-btn"
            onClick={() => {
              planner.removeFromDay(task, date);
              toast("Moved to the backlog (Lists)", { label: "Undo", run: () => planner.reschedule(task, null, date) });
              onClose();
            }}
          >
            <Inbox size={15} /> Remove from this day
          </button>
          <button
            className="dc-btn"
            onClick={() => {
              planner.archive(task);
              onClose();
            }}
          >
            <Archive size={15} /> Archive
          </button>
          <button
            className="dc-btn ml-auto"
            style={{ color: "#a33" }}
            onClick={() => {
              planner.deleteTask(task);
              toast("Task deleted", { label: "Undo", run: () => planner.undeleteTask(task) });
              onClose();
            }}
          >
            <Trash2 size={15} /> Delete
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <div className="pt-2.5">
            <Checkbox checked={task.status === "done"} onToggle={() => complete(task)} label="Done" />
          </div>
          <textarea className="dc-field dc-serif text-lg" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveText} aria-label="Title" />
        </div>

        <Field label="Notes">
          <div className="relative">
            <textarea className="dc-field pr-10" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveText} placeholder="Anything worth remembering…" />
            <span className="absolute right-1 top-1">
              <MicButton onText={(t) => setNotes((n) => (n ? n + " " : "") + t)} label="Dictate notes" />
            </span>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Section">
            <select className="dc-field" value={task.section} onChange={(e) => planner.moveTask(task, date, e.target.value as TaskSection)}>
              {(Object.keys(TASK_SECTION_TITLES) as TaskSection[]).map((s) => (
                <option key={s} value={s}>
                  {TASK_SECTION_TITLES[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className="dc-field" value={task.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
              <option value={0}>None</option>
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High ★</option>
            </select>
          </Field>
          <Field label="Due date" hint="Never changed by rollover">
            <input type="date" className="dc-field" value={task.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value || null })} />
          </Field>
          <Field label="Time (optional)">
            <input type="time" className="dc-field" value={task.scheduled_time ?? ""} onChange={(e) => set({ scheduled_time: e.target.value || null })} />
          </Field>
          <Field label="Estimate (min)">
            <input type="number" min={0} inputMode="numeric" className="dc-field" value={task.estimate_min ?? ""} onChange={(e) => set({ estimate_min: numOrNull(e.target.value) })} />
          </Field>
          <Field label="Actual (min)">
            <input type="number" min={0} inputMode="numeric" className="dc-field" value={task.actual_min ?? ""} onChange={(e) => set({ actual_min: numOrNull(e.target.value) })} />
          </Field>
          <Field label={task.section === "shopping" ? "Category" : "Project / client"}>
            <input className="dc-field" value={task.label ?? ""} onChange={(e) => set({ label: e.target.value || null })} />
          </Field>
          {task.section === "shopping" && (
            <Field label="Quantity">
              <input className="dc-field" value={task.quantity ?? ""} onChange={(e) => set({ quantity: e.target.value || null })} />
            </Field>
          )}
          {task.section === "comms" && (
            <>
              <Field label="Contact">
                <input className="dc-field" value={task.contact_name ?? ""} onChange={(e) => set({ contact_name: e.target.value || null })} />
              </Field>
              <Field label="Email or phone">
                <input className="dc-field" value={task.contact_info ?? ""} onChange={(e) => set({ contact_info: e.target.value || null })} />
              </Field>
              <Field label="Follow up on">
                <input type="date" className="dc-field" value={task.follow_up_date ?? ""} onChange={(e) => set({ follow_up_date: e.target.value || null })} />
              </Field>
            </>
          )}
        </div>

        <Field label="Repeat">
          <RepeatPicker
            value={recurrence && recurrence.active ? recurrence.rule : null}
            date={date}
            onChange={setRule}
          />
        </Field>

        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: "var(--dc-muted)" }}>
            Steps
          </p>
          <ul className="dc-ruled">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center gap-2 pl-3">
                <Checkbox checked={s.status === "done"} onToggle={() => complete(s)} label={s.title} />
                <span className={`flex-1 text-sm ${s.status === "done" ? "dc-done" : ""}`}>
                  <span className="dc-strike">{s.title}</span>
                </span>
                <button className="dc-icon-btn sm" aria-label={`Delete step ${s.title}`} onClick={() => planner.deleteTask(s)}>
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            <li className="flex items-center gap-2 pl-3">
              <input
                className="dc-input text-sm"
                placeholder="Add a step…"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && sub.trim()) {
                    planner.addSubtask(task, sub);
                    setSub("");
                  }
                }}
              />
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Field label="Plan for another day">
            <input type="date" className="dc-field" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
          </Field>
          <button
            className="dc-btn"
            onClick={() => {
              planner.reschedule(task, date, moveDate);
              toast(`Moved to ${formatShort(moveDate)}`);
              onClose();
            }}
          >
            <CalendarArrowUp size={15} /> Move
          </button>
          {task.section !== "must" && (
            <button className="dc-btn" onClick={() => planner.moveTask(task, date, "must")}>
              ★ Make it a Must Do
            </button>
          )}
        </div>

        {mode === "cloud" && (
          <div className="rounded-lg p-3 text-sm" style={{ background: "var(--dc-paper-2)" }}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!link && !link.deleted_at && link.state !== "broken"}
                onChange={(e) => {
                  if (e.target.checked) {
                    if (link) store.update("canvas_task_links", link.id, { deleted_at: null, state: link.external_id ? "linked" : "pending" });
                    else
                      store.create("canvas_task_links", {
                        id: newId(),
                        task_id: task.id,
                        provider: "google_tasks",
                        list_id: null,
                        external_id: null,
                        remote_etag: null,
                        remote_updated: null,
                        local_version_synced: null,
                        state: "pending",
                        conflict: null,
                        last_synced_at: null,
                      });
                  } else if (link) store.remove("canvas_task_links", link.id);
                }}
              />
              <Link2 size={14} /> Sync with Google Tasks
            </label>
            {link && !link.deleted_at && (
              <p className="mt-1 text-xs" style={{ color: "var(--dc-muted)" }}>
                {link.state === "pending" && "Will be sent on the next Google Tasks sync (Settings → Integrations)."}
                {link.state === "linked" && `Linked${link.last_synced_at ? ` · last synced ${new Date(link.last_synced_at).toLocaleString()}` : ""}`}
                {link.state === "conflict" && "Changed in both places — resolve it in Settings → Integrations."}
              </p>
            )}
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer" style={{ color: "var(--dc-muted)" }}>
            History
          </summary>
          <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--dc-muted)" }}>
            <li>First planned {formatShort(task.origin_date)}{task.origin_date < today ? "" : ""}</li>
            {events.map((e) => (
              <li key={e.id}>
                {new Date(e.at).toLocaleString()} — {e.kind}
                {e.kind === "carried" && e.data?.from ? ` from ${formatShort(String(e.data.from))}` : ""}
                {e.kind === "moved" ? ` to ${String(e.data?.to)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Sheet>
  );
}

function RepeatPicker({ value, date, onChange }: { value: RecurrenceRule | null; date: ISODate; onChange: (r: RecurrenceRule | null) => void }) {
  const freq = value?.freq ?? "none";
  const wd = new Date(date + "T12:00:00Z").getUTCDay();
  return (
    <div className="space-y-2">
      <select
        className="dc-field"
        value={freq}
        onChange={(e) => {
          const f = e.target.value;
          if (f === "none") onChange(null);
          else if (f === "weekly") onChange({ freq: "weekly", days: [wd] });
          else if (f === "monthly") onChange({ freq: "monthly", monthDay: Number(date.slice(8, 10)) });
          else onChange({ freq: f as RecurrenceRule["freq"] });
        }}
      >
        <option value="none">Doesn&apos;t repeat</option>
        <option value="daily">Every day</option>
        <option value="weekdays">Every weekday</option>
        <option value="weekly">Weekly…</option>
        <option value="monthly">Monthly</option>
      </select>
      {value?.freq === "weekly" && (
        <div className="flex gap-1" role="group" aria-label="Days of the week">
          {DAYS.map((d, i) => {
            const on = value.days?.includes(i);
            return (
              <button
                key={i}
                aria-pressed={on}
                aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                className="h-9 w-9 rounded-full text-sm"
                style={{ background: on ? "var(--dc-ink)" : "var(--dc-paper-2)", color: on ? "var(--dc-paper)" : "inherit" }}
                onClick={() => {
                  const days = new Set(value.days ?? []);
                  if (on) days.delete(i);
                  else days.add(i);
                  onChange({ ...value, days: [...days].sort() });
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
      {value && (
        <p className="text-xs" style={{ color: "var(--dc-muted)" }}>
          {describeRule(value)}. A new copy appears on each matching day when you open the planner; unfinished copies don&apos;t pile up.
        </p>
      )}
    </div>
  );
}
