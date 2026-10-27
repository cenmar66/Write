"use client";

import { CalendarPlus, ExternalLink, MapPin, Pin, Plus, Trash2, ListChecks, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime, localTimeOf } from "@/lib/canvas/dates";
import type { Appointment, ExternalEvent, Idea, ISODate, MealSlot, TaskSection } from "@/lib/canvas/types";
import { createGoogleEvent, useGoogleStatus } from "./google-client";
import { MicButton } from "./dictation";
import { useCanvas } from "./provider";
import { MenuItem, SectionCard, useLocalFlag } from "./section-card";
import { Field, Sheet } from "./sheet";
import { Checkbox, TaskList } from "./tasks";

// ---- Task sections ---------------------------------------------------------------------
export function TaskSectionCard({ sectionKey, date }: { sectionKey: TaskSection; date: ISODate }) {
  const { planner, rev } = useCanvas();
  const [hideDone, setHideDone] = useLocalFlag(`dc-hide-done-${sectionKey}`);
  const items = useMemo(() => planner.tasksFor(date, sectionKey), [planner, date, sectionKey, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = items.filter((i) => i.task.status === "done").length;
  const allDone = sectionKey === "must" && items.length > 0 && done === items.length;
  const placeholders: Record<TaskSection, string> = {
    must: "What matters most today?",
    work: "Add a work to-do…",
    personal: "Add a personal to-do…",
    comms: "Email or call… (e.g. Call Sarah re: budget)",
    shopping: "Add something to buy…",
  };
  return (
    <SectionCard
      sectionKey={sectionKey}
      count={items.length ? `${done}/${items.length}` : undefined}
      extraMenu={
        <MenuItem icon={hideDone ? <ListChecks size={15} /> : <CheckCheck size={15} />} onClick={() => setHideDone(!hideDone)}>
          {hideDone ? "Show completed" : "Collapse completed"}
        </MenuItem>
      }
    >
      <TaskList section={sectionKey} date={date} minSlots={sectionKey === "must" ? 3 : 0} placeholder={placeholders[sectionKey]} hideDone={hideDone} />
      {allDone && (
        <p className="dc-hand px-4 py-2 text-xl" style={{ color: "var(--dc-accent)" }} role="status">
          Your priorities are complete. Well done.
        </p>
      )}
    </SectionCard>
  );
}

// ---- Appointments ----------------------------------------------------------------------
type Row = { kind: "local"; a: Appointment; start: string | null; end: string | null } | { kind: "ext"; e: ExternalEvent; start: string | null; end: string | null };

export function AppointmentsCard({ date }: { date: ISODate }) {
  const { planner, store, rev, prefs } = useCanvas();
  const [editing, setEditing] = useState<Appointment | "new" | null>(null);
  const [ext, setExt] = useState<ExternalEvent | null>(null);
  const rows = useMemo<Row[]>(() => {
    const local: Row[] = store
      .all("canvas_appointments")
      .filter((a) => a.date === date)
      .map((a) => ({ kind: "local", a, start: a.start_time, end: a.end_time }));
    const ext: Row[] = store.externalEvents(date).map((e) => ({
      kind: "ext",
      e,
      start: e.allDay ? null : localTimeOf(e.start, prefs.timezone),
      end: e.allDay ? null : localTimeOf(e.end, prefs.timezone),
    }));
    return [...local, ...ext].sort((x, y) => (x.start ?? "").localeCompare(y.start ?? ""));
  }, [store, date, rev, prefs.timezone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Overlaps (timed rows only).
  const overlaps = new Set<number>();
  rows.forEach((r, i) =>
    rows.forEach((o, j) => {
      if (i < j && r.start && o.start && r.end && o.end && r.start < o.end && o.start < r.end) {
        overlaps.add(i);
        overlaps.add(j);
      }
    }),
  );

  return (
    <SectionCard sectionKey="appointments" count={rows.length ? `${rows.length} event${rows.length > 1 ? "s" : ""}` : undefined}>
      <ul className="dc-ruled">
        {rows.map((r, i) =>
          r.kind === "local" ? (
            <li key={r.a.id} className="flex items-center gap-2 pl-3 pr-1">
              <Checkbox checked={r.a.attended} onToggle={() => store.update("canvas_appointments", r.a.id, { attended: !r.a.attended })} label={`Attended ${r.a.title}`} />
              <span className="w-16 shrink-0 text-xs tabular-nums" style={{ color: "var(--dc-muted)" }}>
                {r.start ? formatTime(r.start) : "Any time"}
              </span>
              <button className={`min-w-0 flex-1 truncate text-left text-[0.9rem] ${r.a.attended ? "dc-done" : ""}`} onClick={() => setEditing(r.a)}>
                <span className="dc-strike">{r.a.title || "Untitled"}</span>
                {r.a.location && <span className="ml-1 text-xs" style={{ color: "var(--dc-faint)" }}>· {r.a.location}</span>}
              </button>
              {overlaps.has(i) && <span className="dc-chip" style={{ color: "#a3592f" }}>overlaps</span>}
            </li>
          ) : (
            <li key={r.e.key} className="flex items-center gap-2 pl-3 pr-1">
              <span className="ml-0.5 mr-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.e.calendarColor ?? "#6189b8" }} title={r.e.calendarName} />
              <span className="w-16 shrink-0 text-xs tabular-nums" style={{ color: "var(--dc-muted)" }}>
                {r.e.allDay ? "All day" : formatTime(r.start)}
              </span>
              <button className="min-w-0 flex-1 truncate text-left text-[0.9rem]" onClick={() => setExt(r.e)}>
                {r.e.title}
                {r.e.location && <span className="ml-1 text-xs" style={{ color: "var(--dc-faint)" }}>· {r.e.location}</span>}
              </button>
              <span className="dc-chip" title={`From Google Calendar: ${r.e.calendarName}`}>
                {r.e.isTimeBlock ? "time block" : "Google"}
              </span>
              {overlaps.has(i) && <span className="dc-chip" style={{ color: "#a3592f" }}>overlaps</span>}
              {r.e.htmlLink && (
                <a className="dc-icon-btn sm" href={r.e.htmlLink} target="_blank" rel="noreferrer" aria-label={`Open ${r.e.title} in Google Calendar`}>
                  <ExternalLink size={13} />
                </a>
              )}
            </li>
          ),
        )}
        <QuickAppointment date={date} onAdd={(a) => planner.addAppointment(a)} />
      </ul>
      {editing && <AppointmentSheet appt={editing === "new" ? null : editing} date={date} onClose={() => setEditing(null)} />}
      {ext && <ExternalEventSheet e={ext} onClose={() => setExt(null)} />}
    </SectionCard>
  );
}

function QuickAppointment({ date, onAdd }: { date: ISODate; onAdd: (a: Partial<Appointment> & { date: ISODate; title: string }) => void }) {
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const add = () => {
    if (!title.trim()) return;
    onAdd({ date, title: title.trim(), start_time: time || null });
    setTitle("");
    setTime("");
  };
  return (
    <li className="dc-noprint flex items-center gap-2 pl-3 pr-1">
      <Plus size={14} style={{ color: "var(--dc-faint)" }} aria-hidden />
      <input type="time" className="dc-input w-[5.5rem] shrink-0 text-xs" aria-label="Appointment time" value={time} onChange={(e) => setTime(e.target.value)} />
      <input className="dc-input text-[0.9rem]" placeholder="Add an appointment…" aria-label="Appointment title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <MicButton onText={(t) => setTitle((c) => (c ? c + " " : "") + t)} label="Dictate an appointment" />
    </li>
  );
}

/** A Google event: read here; changes go to Google only after an explicit confirm. */
function ExternalEventSheet({ e, onClose }: { e: ExternalEvent; onClose: () => void }) {
  const { prefs, toast, store } = useCanvas();
  const google = useGoogleStatus();
  const [title, setTitle] = useState(e.title);
  const [start, setStart] = useState(e.allDay ? "" : localTimeOf(e.start, prefs.timezone));
  const [end, setEnd] = useState(e.allDay ? "" : localTimeOf(e.end, prefs.timezone));
  const [busy, setBusy] = useState(false);
  const path = `/api/canvas/google/events/${encodeURIComponent(e.calendarId)}/${encodeURIComponent(e.eventId)}`;
  const refresh = () => store.setExternalEvents(e.date, e.date, store.externalEvents(e.date).filter((x) => x.eventId !== e.eventId));
  const save = async () => {
    if (!window.confirm(`Update “${e.title}” in Google Calendar?`)) return;
    setBusy(true);
    const r = await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true, title, ...(start && end && !e.allDay ? { date: e.date, start, end, timeZone: prefs.timezone } : {}) }) });
    setBusy(false);
    if (!r.ok) return toast((await r.json().catch(() => ({}))).error ?? "Couldn't update the event");
    toast("Updated in Google Calendar");
    onClose();
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${e.title}” from Google Calendar? This can't be undone here.`)) return;
    setBusy(true);
    const r = await fetch(`${path}?confirmed=1`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return toast((await r.json().catch(() => ({}))).error ?? "Couldn't delete the event");
    refresh();
    toast("Deleted from Google Calendar");
    onClose();
  };
  const editable = google.connected && google.canWriteCalendar && !e.allDay;
  return (
    <Sheet
      title="Google Calendar event"
      onClose={onClose}
      footer={
        <>
          {e.htmlLink && (
            <a className="dc-btn" href={e.htmlLink} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Open in Google
            </a>
          )}
          {editable && (
            <button className="dc-btn" style={{ color: "#a33" }} disabled={busy} onClick={remove}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          {editable && (
            <button className="dc-btn dc-btn-primary ml-auto" disabled={busy} onClick={save}>
              Save to Google
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs" style={{ color: "var(--dc-muted)" }}>
          From {e.calendarName}
          {e.isTimeBlock ? " · looks like a planned time block" : ""}. Shown as of the last refresh.
        </p>
        <Field label="Title">
          <input className="dc-field" value={title} onChange={(x) => setTitle(x.target.value)} disabled={!editable} />
        </Field>
        {!e.allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input type="time" className="dc-field" value={start} onChange={(x) => setStart(x.target.value)} disabled={!editable} />
            </Field>
            <Field label="Ends">
              <input type="time" className="dc-field" value={end} onChange={(x) => setEnd(x.target.value)} disabled={!editable} />
            </Field>
          </div>
        )}
        {e.location && <p className="text-sm">📍 {e.location}</p>}
      </div>
    </Sheet>
  );
}

export function AppointmentSheet({ appt, date, onClose }: { appt: Appointment | null; date: ISODate; onClose: () => void }) {
  const { planner, store, prefs, toast } = useCanvas();
  const google = useGoogleStatus();
  const [f, setF] = useState({
    title: appt?.title ?? "",
    date: appt?.date ?? date,
    start_time: appt?.start_time ?? "",
    end_time: appt?.end_time ?? "",
    location: appt?.location ?? "",
    notes: appt?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const save = () => {
    const patch = { ...f, start_time: f.start_time || null, end_time: f.end_time || null, location: f.location || null };
    if (appt) store.update("canvas_appointments", appt.id, patch);
    else if (f.title.trim()) planner.addAppointment(patch);
    onClose();
  };
  const toGoogle = async () => {
    if (!f.start_time) return toast("Add a start time first.");
    if (!window.confirm(`Create “${f.title}” on your Google Calendar?`)) return;
    setBusy(true);
    try {
      await createGoogleEvent({ title: f.title, date: f.date, start: f.start_time, end: f.end_time || null, location: f.location || null, notes: f.notes, timeZone: prefs.timezone });
      toast("Added to Google Calendar");
      if (appt) store.remove("canvas_appointments", appt.id);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create the event");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={appt ? "Appointment" : "New appointment"}
      onClose={onClose}
      footer={
        <>
          {appt && (
            <button className="dc-btn" style={{ color: "#a33" }} onClick={() => (store.remove("canvas_appointments", appt.id), onClose())}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          {google.connected && google.canWriteCalendar && (
            <button className="dc-btn" disabled={busy} onClick={toGoogle} title="Moves it to Google Calendar (it will show here from Google)">
              <CalendarPlus size={15} /> Move to Google Calendar
            </button>
          )}
          <button className="dc-btn dc-btn-primary ml-auto" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Title">
            <div className="flex gap-1">
              <input className="dc-field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <MicButton onText={(t) => setF((x) => ({ ...x, title: (x.title ? x.title + " " : "") + t }))} />
            </div>
          </Field>
        </div>
        <Field label="Date">
          <input type="date" className="dc-field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Location">
          <div className="relative">
            <MapPin size={14} className="absolute left-2 top-3" style={{ color: "var(--dc-faint)" }} />
            <input className="dc-field pl-7" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          </div>
        </Field>
        <Field label="Starts">
          <input type="time" className="dc-field" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
        </Field>
        <Field label="Ends">
          <input type="time" className="dc-field" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label="Notes">
            <textarea className="dc-field" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </div>
        <p className="col-span-2 text-xs" style={{ color: "var(--dc-faint)" }}>
          Ticking an appointment marks that you attended. It isn&apos;t a task and never changes your calendar.
        </p>
      </div>
    </Sheet>
  );
}

// ---- Good things -------------------------------------------------------------------------
export function JournalCard({ date }: { date: ISODate }) {
  const { planner, store, rev } = useCanvas();
  const entries = useMemo(() => store.all("canvas_journal").filter((j) => j.date === date).sort((a, b) => a.position - b.position), [store, date, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SectionCard sectionKey="journal" count={entries.length ? String(entries.length) : undefined}>
      <ul className="dc-ruled">
        {entries.map((j) => (
          <li key={j.id} className="group flex items-start gap-2 pl-4 pr-1">
            <span className="mt-[0.95rem] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--dc-accent)" }} aria-hidden />
            <AutoText value={j.body} onSave={(v) => (v.trim() ? store.update("canvas_journal", j.id, { body: v }) : store.remove("canvas_journal", j.id))} label="Good thing" />
            <button className="dc-icon-btn sm opacity-0 group-hover:opacity-60 focus:opacity-100" aria-label="Delete" onClick={() => store.remove("canvas_journal", j.id)}>
              <Trash2 size={13} />
            </button>
          </li>
        ))}
        <AddText placeholder="Something good that happened…" onAdd={(t) => planner.addJournal(date, t)} />
      </ul>
    </SectionCard>
  );
}

/** Text that grows with its content and saves on blur. */
export function AutoText({ value, onSave, label, className = "" }: { value: string; onSave: (v: string) => void; label: string; className?: string }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // The saved text changed (e.g. from another device): show it.
    setSeen(value);
    setV(value);
  }
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [v]);
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      className={`dc-input resize-none py-[0.55rem] text-[0.9rem] leading-snug ${className}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
    />
  );
}

export function AddText({ placeholder, onAdd }: { placeholder: string; onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  const add = () => {
    if (v.trim()) onAdd(v);
    setV("");
  };
  return (
    <li className="dc-noprint flex items-center gap-2 pl-3 pr-1">
      <Plus size={14} style={{ color: "var(--dc-faint)" }} aria-hidden />
      <input className="dc-input text-[0.9rem]" placeholder={placeholder} aria-label={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} onBlur={add} />
      <MicButton onText={(t) => setV((c) => (c ? c + " " : "") + t)} />
    </li>
  );
}

// ---- Exercise --------------------------------------------------------------------------
const ACTIVITIES = ["Tennis", "Strength", "Cycling", "Walk", "Sauna", "Run", "Yoga"];

export function ExerciseCard({ date }: { date: ISODate }) {
  const { planner, store, rev } = useCanvas();
  const rows = useMemo(() => store.all("canvas_exercise").filter((e) => e.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at)), [store, date, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const minutes = rows.reduce((s, e) => s + (e.duration_min ?? 0), 0);
  const [activity, setActivity] = useState("");
  const [mins, setMins] = useState("");
  const add = (a = activity) => {
    if (!a.trim()) return;
    planner.addExercise(date, a.trim(), mins ? Number(mins) : null);
    setActivity("");
    setMins("");
  };
  return (
    <SectionCard sectionKey="exercise" count={minutes ? `${minutes} min` : rows.length ? String(rows.length) : undefined}>
      <ul className="dc-ruled">
        {rows.map((e) => (
          <li key={e.id} className="group flex items-center gap-2 pl-3 pr-1">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--dc-accent)" }} aria-hidden />
            <input className="dc-input text-[0.9rem]" defaultValue={e.activity} aria-label="Activity" onBlur={(ev) => ev.target.value !== e.activity && store.update("canvas_exercise", e.id, { activity: ev.target.value })} />
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className="dc-input w-12 text-right text-sm tabular-nums"
              defaultValue={e.duration_min ?? ""}
              aria-label="Minutes"
              onBlur={(ev) => store.update("canvas_exercise", e.id, { duration_min: ev.target.value ? Number(ev.target.value) : null })}
            />
            <span className="text-xs" style={{ color: "var(--dc-faint)" }}>
              min
            </span>
            <select
              className="dc-input w-auto text-xs"
              value={e.intensity ?? ""}
              aria-label="Intensity"
              onChange={(ev) => store.update("canvas_exercise", e.id, { intensity: (ev.target.value || null) as "easy" | null })}
              style={{ color: "var(--dc-muted)" }}
            >
              <option value="">—</option>
              <option value="easy">easy</option>
              <option value="moderate">moderate</option>
              <option value="hard">hard</option>
            </select>
            <button className="dc-icon-btn sm opacity-0 group-hover:opacity-60 focus:opacity-100" aria-label="Delete" onClick={() => store.remove("canvas_exercise", e.id)}>
              <Trash2 size={13} />
            </button>
          </li>
        ))}
        <li className="dc-noprint flex items-center gap-2 pl-3 pr-1">
          <Plus size={14} style={{ color: "var(--dc-faint)" }} aria-hidden />
          <input className="dc-input text-[0.9rem]" placeholder="Activity…" aria-label="New activity" value={activity} onChange={(e) => setActivity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} list="dc-activities" />
          <datalist id="dc-activities">{ACTIVITIES.map((a) => <option key={a} value={a} />)}</datalist>
          <input type="number" min={0} inputMode="numeric" placeholder="—" aria-label="Minutes" className="dc-input w-12 text-right text-sm" value={mins} onChange={(e) => setMins(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <span className="text-xs" style={{ color: "var(--dc-faint)" }} aria-hidden>
            min
          </span>
          <button className="dc-icon-btn sm" aria-label="Add exercise" onClick={() => add()}>
            <Plus size={15} />
          </button>
        </li>
      </ul>
      {!rows.length && (
        <div className="dc-noprint flex flex-wrap gap-1 px-3 py-2">
          {ACTIVITIES.slice(0, 5).map((a) => (
            <button key={a} className="dc-chip hover:opacity-80" onClick={() => setActivity(a)}>
              {a}
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Meals -------------------------------------------------------------------------------
const SLOTS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Breakfast" },
  { slot: "lunch", label: "Lunch" },
  { slot: "dinner", label: "Dinner" },
];

export function MealsCard({ date }: { date: ISODate }) {
  const { planner, store, rev } = useCanvas();
  const meals = useMemo(() => store.all("canvas_meals").filter((m) => m.date === date), [store, date, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = meals.reduce((s, m) => s + (m.calories ?? 0), 0);
  const snacks = meals.filter((m) => m.slot === "snack").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const row = (key: string, label: string, desc: string, cal: number | null, onDesc: (v: string) => void, onCal: (v: number | null) => void, onDelete?: () => void) => (
    <li key={key} className="group flex items-center gap-2 pl-3 pr-1">
      <span className="w-[4.5rem] shrink-0 text-xs" style={{ color: "var(--dc-muted)" }}>
        {label}
      </span>
      <input className="dc-input text-[0.9rem]" defaultValue={desc} key={desc} aria-label={`${label} description`} placeholder="—" onBlur={(e) => e.target.value !== desc && onDesc(e.target.value)} />
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className="dc-input w-12 text-right text-sm tabular-nums"
        defaultValue={cal ?? ""}
        key={`c${cal}`}
        placeholder="—"
        aria-label={`${label} calories (optional)`}
        onBlur={(e) => onCal(e.target.value ? Number(e.target.value) : null)}
      />
      <span className="text-[0.7rem]" style={{ color: "var(--dc-faint)" }} aria-hidden>
        kcal
      </span>
      {onDelete && (
        <button className="dc-icon-btn sm opacity-0 group-hover:opacity-60 focus:opacity-100" aria-label="Remove snack" onClick={onDelete}>
          <Trash2 size={13} />
        </button>
      )}
    </li>
  );
  return (
    <SectionCard sectionKey="meals" count={total ? `${total.toLocaleString()} kcal` : undefined}>
      <ul className="dc-ruled">
        {SLOTS.map(({ slot, label }) => {
          const m = planner.meal(date, slot);
          return row(
            slot,
            label,
            m?.description ?? "",
            m?.calories ?? null,
            (v) => planner.setMeal(date, slot, { description: v }),
            (v) => (m || v !== null) && planner.setMeal(date, slot, { calories: v }),
          );
        })}
        {snacks.map((s) =>
          row(
            s.id,
            "Snack",
            s.description,
            s.calories,
            (v) => store.update("canvas_meals", s.id, { description: v }),
            (v) => store.update("canvas_meals", s.id, { calories: v }),
            () => store.remove("canvas_meals", s.id),
          ),
        )}
        <li className="dc-noprint flex items-center pl-3">
          <button className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--dc-muted)" }} onClick={() => planner.addSnack(date)}>
            <Plus size={13} /> Add a snack
          </button>
        </li>
      </ul>
    </SectionCard>
  );
}

// ---- Water -------------------------------------------------------------------------------
export function WaterCard({ date }: { date: ISODate }) {
  const { planner, prefs, rev } = useCanvas();
  const w = useMemo(() => planner.water(date), [planner, date, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = w?.target ?? prefs.water_target;
  const glasses = w?.glasses ?? 0;
  const total = Math.max(target, glasses);
  return (
    <SectionCard sectionKey="water" count={`${glasses}/${target}`}>
      <div className="flex flex-wrap items-end gap-1.5 px-3 py-3" role="group" aria-label={`Water: ${glasses} of ${target} glasses`}>
        {Array.from({ length: total }).map((_, i) => {
          const full = i < glasses;
          return (
            <button
              key={i}
              className="dc-glass"
              data-full={full}
              aria-label={full ? `Empty glass ${i + 1}` : `Fill glass ${i + 1}`}
              aria-pressed={full}
              onClick={() => planner.setWater(date, full && i === glasses - 1 ? i : full ? i : i + 1)}
            >
              <svg viewBox="0 0 30 38" className="h-full w-full" aria-hidden>
                <defs>
                  <clipPath id={`glass-${i}`}>
                    <path d="M4 3h22l-2.6 31.2a2 2 0 0 1-2 1.8H8.6a2 2 0 0 1-2-1.8z" />
                  </clipPath>
                </defs>
                <g clipPath={`url(#glass-${i})`}>
                  <rect className="water" x="0" y="9" width="30" height="30" fill="var(--dc-accent)" opacity="0.85" />
                </g>
                <path d="M4 3h22l-2.6 31.2a2 2 0 0 1-2 1.8H8.6a2 2 0 0 1-2-1.8z" fill="none" stroke="var(--dc-accent)" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
        <button className="dc-icon-btn sm dc-noprint" aria-label="Add an extra glass" onClick={() => planner.setWater(date, glasses + 1)}>
          <Plus size={14} />
        </button>
      </div>
      <p className="px-3 pb-2 text-xs" style={{ color: "var(--dc-faint)" }}>
        {((glasses * (w?.glass_ml ?? prefs.glass_ml)) / 1000).toFixed(2).replace(/\.?0+$/, "")} L of {((target * (w?.glass_ml ?? prefs.glass_ml)) / 1000).toFixed(1)} L
      </p>
    </SectionCard>
  );
}

// ---- Big ideas -----------------------------------------------------------------------------
export function IdeasCard({ date }: { date: ISODate }) {
  const { planner, store, rev, toast } = useCanvas();
  const ideas = useMemo(() => store.all("canvas_ideas").filter((i) => i.date === date).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.created_at.localeCompare(b.created_at)), [store, date, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SectionCard sectionKey="ideas" count={ideas.length ? String(ideas.length) : undefined} bodyClassName="min-h-40">
      <ul className="dc-ruled">
        {ideas.map((idea) => (
          <IdeaRow
            key={idea.id}
            idea={idea}
            onConvert={() => {
              const t = planner.ideaToTask(idea.id, "personal", date);
              if (t) toast("Added as a personal to-do");
            }}
          />
        ))}
        <AddText placeholder="Capture a big idea… (#tags welcome)" onAdd={(t) => planner.addIdea(date, t)} />
      </ul>
      <Link href="/canvas/notes" className="dc-noprint block px-3 py-2 text-xs underline-offset-2 hover:underline" style={{ color: "var(--dc-muted)" }}>
        Browse all ideas →
      </Link>
    </SectionCard>
  );
}

function IdeaRow({ idea, onConvert }: { idea: Idea; onConvert: () => void }) {
  const { store } = useCanvas();
  return (
    <li className="group flex items-start gap-1 pl-3 pr-1">
      <button className="dc-icon-btn sm mt-1" aria-label={idea.pinned ? "Unpin" : "Pin"} aria-pressed={idea.pinned} onClick={() => store.update("canvas_ideas", idea.id, { pinned: !idea.pinned })} style={{ color: idea.pinned ? "var(--dc-accent)" : undefined }}>
        <Pin size={13} fill={idea.pinned ? "currentColor" : "none"} />
      </button>
      <div className="min-w-0 flex-1">
        <AutoText
          value={idea.body}
          label="Idea"
          className="dc-hand text-[1.15rem]"
          onSave={(v) => {
            const tags = [...new Set([...v.matchAll(/#([\p{L}\d_-]+)/gu)].map((m) => m[1].toLowerCase()))];
            store.update("canvas_ideas", idea.id, { body: v, tags });
          }}
        />
      </div>
      {idea.converted_task_id ? (
        <span className="dc-chip mt-2">task</span>
      ) : (
        <button className="dc-icon-btn sm mt-1 opacity-0 group-hover:opacity-70 focus:opacity-100" aria-label="Turn into a task" title="Turn into a task" onClick={onConvert}>
          <ListChecks size={14} />
        </button>
      )}
    </li>
  );
}

// ---- Notes --------------------------------------------------------------------------------
export function NotesCard({ date }: { date: ISODate }) {
  const { planner, rev } = useCanvas();
  const note = useMemo(() => planner.noteFor(date), [planner, date, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  // While typing, the draft is shown; otherwise the saved note (which may have just
  // arrived from another device). The card is keyed by date, so days never mix.
  const [draft, setDraft] = useState<string | null>(null);
  const v = draft ?? note?.body ?? "";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string | null>(null);

  const schedule = (next: string) => {
    setDraft(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (latest.current !== null) planner.setNote(date, latest.current);
      latest.current = null;
      setDraft(null);
    }, 600);
  };
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current !== null) planner.setNote(date, latest.current);
      }
    },
    [planner, date],
  );

  return (
    <SectionCard sectionKey="notes" bodyClassName="min-h-56">
      <div className="relative">
        <textarea
          aria-label="Notes for the day"
          className="dc-input dc-ruled-bg block min-h-56 resize-y px-3 text-[0.95rem]"
          value={v}
          placeholder="Write anything…"
          onChange={(e) => schedule(e.target.value)}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
            if (v !== (note?.body ?? "")) planner.setNote(date, v);
            latest.current = null;
            setDraft(null);
          }}
        />
        <span className="dc-noprint absolute right-1 top-1">
          <MicButton onText={(t) => schedule((v ? v.replace(/\s+$/, "") + " " : "") + t)} label="Dictate notes" />
        </span>
      </div>
    </SectionCard>
  );
}
