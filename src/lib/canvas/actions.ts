// Planner operations. Each one is a small set of store writes, so it works the same
// offline and online, and every task status change also appends to the event ledger.

import { dayMetaId, mealId, newId, noteId, occurrenceId, placementId, prefsId, stableId, waterId } from "./ids";
import { generateOccurrences, rollover } from "./planning";
import { DEFAULT_ORDER } from "./sections";
import type { CanvasStore } from "./store";
import type {
  Appointment,
  ISODate,
  MealSlot,
  Placement,
  Preferences,
  Task,
  TaskEventKind,
  TaskSection,
} from "./types";
import { localDateOf } from "./dates";

export const DEFAULT_PREFS: Omit<Preferences, "id" | "created_at" | "updated_at" | "version" | "deleted_at"> = {
  timezone: "America/Los_Angeles",
  theme: "system",
  sound: true,
  animations: true,
  density: "comfortable",
  section_order: DEFAULT_ORDER,
  hidden_sections: [],
  section_colors: {},
  color_theme: "paper-classic",
  water_target: 8,
  glass_ml: 250,
  carry_shopping: false,
  dictation_lang: "en-US",
  ai_interpreter: false,
  reminders: {},
  tagline: "A focused day builds a brighter life.",
};

export class Planner {
  constructor(
    readonly store: CanvasStore,
    readonly userKey: string,
  ) {}

  // ---- preferences --------------------------------------------------------------
  get prefsId() {
    return prefsId(this.userKey);
  }
  prefs(): Preferences {
    const p = this.store.get("canvas_preferences", this.prefsId);
    return { ...DEFAULT_PREFS, id: this.prefsId, created_at: "", updated_at: "", version: 0, deleted_at: null, ...(p ?? {}) } as Preferences;
  }
  setPrefs(patch: Partial<Preferences>) {
    if (!this.store.get("canvas_preferences", this.prefsId)) {
      this.store.create("canvas_preferences", { ...DEFAULT_PREFS, ...patch, id: this.prefsId } as never);
    } else {
      this.store.update("canvas_preferences", this.prefsId, patch);
    }
  }
  get tz() {
    return this.prefs().timezone;
  }
  localToday(): ISODate {
    return localDateOf(new Date(), this.tz);
  }

  // ---- ledger -------------------------------------------------------------------
  private log(taskId: string, kind: TaskEventKind, data: Record<string, unknown> = {}, id = newId()) {
    const at = new Date().toISOString();
    this.store.create("canvas_task_events", { id, task_id: taskId, kind, at, local_date: localDateOf(at, this.tz), data });
  }

  // ---- daily planning: rollover + recurring occurrences --------------------------
  /** Safe to call any number of times (deterministic ids). Only meaningful for today. */
  planDay(today: ISODate) {
    const prefs = this.prefs();
    const tasks = this.store.all("canvas_tasks");
    const placements = this.store.allWithDeleted("canvas_task_placements");
    // Known occurrences: by id, and by (recurrence, date) for a task that was turned into
    // the first occurrence of a new recurrence (its id isn't the derived one).
    const known = new Set<string>();
    for (const t of this.store.allWithDeleted("canvas_tasks")) {
      known.add(t.id);
      if (t.recurrence_id && t.occurrence_date) known.add(occurrenceId(t.recurrence_id, t.occurrence_date));
    }
    const occ = generateOccurrences(today, this.store.all("canvas_recurrences"), known);
    for (const t of occ.tasks) this.store.create("canvas_tasks", t);
    for (const p of occ.placements) this.store.create("canvas_task_placements", p);
    for (const e of occ.events) this.store.create("canvas_task_events", e);
    const r = rollover(today, tasks, placements, { carryShopping: prefs.carry_shopping });
    for (const p of r.placements) this.store.create("canvas_task_placements", p);
    for (const e of r.events) this.store.create("canvas_task_events", e);
    return { carried: r.placements.length, created: occ.tasks.length };
  }

  // ---- tasks --------------------------------------------------------------------
  placementsOn(date: ISODate): Placement[] {
    return this.store.all("canvas_task_placements").filter((p) => p.date === date && !p.removed);
  }

  /** Tasks shown in a section on a date, in order, with their placement. */
  tasksFor(date: ISODate, section: TaskSection) {
    const out: { task: Task; placement: Placement }[] = [];
    for (const p of this.placementsOn(date)) {
      if (p.section !== section) continue;
      const task = this.store.get("canvas_tasks", p.task_id);
      if (!task || task.deleted_at || task.parent_id || task.status === "archived") continue;
      out.push({ task, placement: p });
    }
    return out.sort((a, b) => a.placement.position - b.placement.position);
  }

  subtasks(parentId: string): Task[] {
    return this.store
      .all("canvas_tasks")
      .filter((t) => t.parent_id === parentId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  addTask(date: ISODate, section: TaskSection, title: string, extra: Partial<Task> = {}): Task {
    const id = newId();
    const task = this.store.create("canvas_tasks", {
      id,
      section,
      title: title.trim(),
      notes: "",
      priority: section === "must" ? 2 : 0,
      label: null,
      due_date: null,
      estimate_min: null,
      actual_min: null,
      scheduled_time: null,
      parent_id: null,
      status: "open",
      completed_at: null,
      completed_on: null,
      origin_date: date,
      backlog: false,
      carry: true,
      recurrence_id: null,
      occurrence_date: null,
      contact_name: null,
      contact_info: null,
      follow_up_date: null,
      quantity: null,
      source: "local",
      ...extra,
    });
    if (!extra.backlog && !extra.parent_id) this.place(task.id, date, section);
    this.log(id, "created", { section });
    return task;
  }

  addSubtask(parent: Task, title: string) {
    return this.addTask(parent.origin_date, parent.section, title, { parent_id: parent.id, priority: 0 });
  }

  private place(taskId: string, date: ISODate, section: TaskSection, carried = false) {
    const id = placementId(taskId, date);
    const existing = this.store.get("canvas_task_placements", id);
    const pos = Math.max(0, ...this.placementsOn(date).filter((p) => p.section === section).map((p) => p.position)) + 1;
    if (existing) {
      this.store.update("canvas_task_placements", id, { section, removed: false, deleted_at: null, position: pos });
    } else {
      this.store.create("canvas_task_placements", { id, task_id: taskId, date, section, position: pos, carried, removed: false });
    }
  }

  updateTask(id: string, patch: Partial<Task>) {
    this.store.update("canvas_tasks", id, patch);
  }

  toggleComplete(task: Task, onDate: ISODate) {
    if (task.status === "done") {
      this.store.update("canvas_tasks", task.id, { status: "open", completed_at: null, completed_on: null });
      this.log(task.id, "reopened", { was_completed_on: task.completed_on });
    } else {
      const at = new Date().toISOString();
      // Completing on a past day's page records it on that day; otherwise on today.
      const today = this.localToday();
      const on = onDate < today ? onDate : localDateOf(at, this.tz);
      this.store.update("canvas_tasks", task.id, { status: "done", completed_at: at, completed_on: on });
      this.log(task.id, "completed", { on });
    }
  }

  moveTask(task: Task, date: ISODate, to: TaskSection) {
    if (task.section === to) return;
    this.store.update("canvas_tasks", task.id, { section: to });
    const pid = placementId(task.id, date);
    if (this.store.get("canvas_task_placements", pid)) {
      const pos = Math.max(0, ...this.placementsOn(date).filter((p) => p.section === to).map((p) => p.position)) + 1;
      this.store.update("canvas_task_placements", pid, { section: to, position: pos });
    }
    this.log(task.id, "moved", { from: task.section, to });
  }

  reorder(date: ISODate, section: TaskSection, orderedTaskIds: string[]) {
    orderedTaskIds.forEach((tid, i) => {
      const pid = placementId(tid, date);
      const p = this.store.get("canvas_task_placements", pid);
      if (p && p.position !== i + 1) this.store.update("canvas_task_placements", pid, { position: i + 1, section });
    });
  }

  /** Take it off this day's page without deleting it (goes to the backlog). */
  removeFromDay(task: Task, date: ISODate) {
    const pid = placementId(task.id, date);
    if (this.store.get("canvas_task_placements", pid)) this.store.update("canvas_task_placements", pid, { removed: true });
    this.store.update("canvas_tasks", task.id, { backlog: true });
    this.log(task.id, "rescheduled", { from: date, to: "backlog" });
  }

  /** Plan it for another day (keeps its due date). */
  reschedule(task: Task, from: ISODate | null, to: ISODate) {
    if (from) {
      const pid = placementId(task.id, from);
      if (this.store.get("canvas_task_placements", pid)) this.store.update("canvas_task_placements", pid, { removed: true });
    }
    this.store.update("canvas_tasks", task.id, { backlog: false });
    this.place(task.id, to, task.section);
    this.log(task.id, "rescheduled", { from, to });
  }

  archive(task: Task) {
    this.store.update("canvas_tasks", task.id, { status: "archived" });
    this.log(task.id, "archived");
  }
  deleteTask(task: Task) {
    this.store.remove("canvas_tasks", task.id);
    for (const s of this.subtasks(task.id)) this.store.remove("canvas_tasks", s.id);
    this.log(task.id, "deleted");
  }
  undeleteTask(task: Task) {
    this.store.restore("canvas_tasks", task.id);
    this.log(task.id, "restored");
  }

  backlog(): Task[] {
    return this.store
      .all("canvas_tasks")
      .filter((t) => t.backlog && t.status === "open" && !t.parent_id)
      .sort((a, b) => a.origin_date.localeCompare(b.origin_date));
  }

  // ---- appointments ---------------------------------------------------------------
  addAppointment(a: Partial<Appointment> & { date: ISODate; title: string }) {
    return this.store.create("canvas_appointments", {
      id: newId(),
      start_time: null,
      end_time: null,
      location: null,
      notes: "",
      attended: false,
      ...a,
    });
  }

  // ---- journal / ideas / notes ----------------------------------------------------
  addJournal(date: ISODate, body: string) {
    const pos = this.store.all("canvas_journal").filter((j) => j.date === date).length + 1;
    return this.store.create("canvas_journal", { id: newId(), date, body: body.trim(), position: pos });
  }

  addIdea(date: ISODate, body: string, tags: string[] = []) {
    const found = [...body.matchAll(/#([\p{L}\d_-]+)/gu)].map((m) => m[1].toLowerCase());
    return this.store.create("canvas_ideas", {
      id: newId(),
      date,
      body: body.trim(),
      tags: [...new Set([...tags, ...found])],
      pinned: false,
      converted_task_id: null,
    });
  }

  ideaToTask(ideaId: string, section: TaskSection, date: ISODate) {
    const idea = this.store.get("canvas_ideas", ideaId);
    if (!idea) return;
    const t = this.addTask(date, section, idea.body.split("\n")[0].slice(0, 200), { notes: idea.body, source: "idea" });
    this.store.update("canvas_ideas", ideaId, { converted_task_id: t.id });
    return t;
  }

  noteFor(date: ISODate) {
    return this.store.get("canvas_notes", noteId(this.userKey, date));
  }
  setNote(date: ISODate, body: string) {
    const id = noteId(this.userKey, date);
    if (this.store.get("canvas_notes", id)) this.store.update("canvas_notes", id, { body });
    else this.store.create("canvas_notes", { id, date, body });
  }
  appendNote(date: ISODate, text: string) {
    const cur = this.noteFor(date)?.body ?? "";
    this.setNote(date, cur ? `${cur.replace(/\s+$/, "")}\n${text}` : text);
  }

  // ---- exercise / meals / water ---------------------------------------------------
  addExercise(date: ISODate, activity: string, duration_min: number | null = null) {
    return this.store.create("canvas_exercise", {
      id: newId(),
      date,
      activity,
      duration_min,
      intensity: null,
      notes: "",
      metrics: {},
    });
  }

  meal(date: ISODate, slot: MealSlot) {
    return this.store.get("canvas_meals", mealId(this.userKey, date, slot));
  }
  setMeal(date: ISODate, slot: MealSlot, patch: { description?: string; calories?: number | null }) {
    const id = mealId(this.userKey, date, slot);
    if (this.store.get("canvas_meals", id)) this.store.update("canvas_meals", id, patch);
    else this.store.create("canvas_meals", { id, date, slot, description: "", calories: null, ...patch });
  }
  snacks(date: ISODate) {
    return this.store.all("canvas_meals").filter((m) => m.date === date && m.slot === "snack");
  }
  addSnack(date: ISODate) {
    return this.store.create("canvas_meals", { id: newId(), date, slot: "snack", description: "", calories: null });
  }

  water(date: ISODate) {
    return this.store.get("canvas_water", waterId(this.userKey, date));
  }
  setWater(date: ISODate, glasses: number) {
    const id = waterId(this.userKey, date);
    const prefs = this.prefs();
    const g = Math.max(0, Math.min(48, glasses));
    if (this.store.get("canvas_water", id)) this.store.update("canvas_water", id, { glasses: g });
    else this.store.create("canvas_water", { id, date, glasses: g, target: prefs.water_target, glass_ml: prefs.glass_ml });
  }

  // ---- day wrap-up ----------------------------------------------------------------
  dayMeta(date: ISODate) {
    return this.store.get("canvas_day_meta", dayMetaId(this.userKey, date));
  }
  closeDay(date: ISODate, reflection?: string) {
    const id = dayMetaId(this.userKey, date);
    const patch = { closed_at: new Date().toISOString(), ...(reflection !== undefined ? { reflection } : {}) };
    if (this.store.get("canvas_day_meta", id)) this.store.update("canvas_day_meta", id, patch);
    else this.store.create("canvas_day_meta", { id, date, reflection: "", ...patch });
  }

  // ---- ink ------------------------------------------------------------------------
  addStroke(date: ISODate, zone: string, s: { tool: "pen" | "highlighter"; color: string; width: number; points: number[] }) {
    return this.store.create("canvas_ink", { id: newId(), date, zone, ...s });
  }
  strokes(date: ISODate, zone: string) {
    return this.store
      .all("canvas_ink")
      .filter((s) => s.date === date && s.zone === zone)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // ---- recurrence -----------------------------------------------------------------
  makeRecurring(task: Task, rule: import("./types").RecurrenceRule, startDate: ISODate) {
    const rid = task.recurrence_id ?? stableId("recurrence-from", task.id);
    const existing = this.store.get("canvas_recurrences", rid);
    const fields = {
      section: task.section,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      label: task.label,
      estimate_min: task.estimate_min,
      scheduled_time: task.scheduled_time,
      rule,
      start_date: startDate,
      end_date: null,
      carry: false,
      active: true,
    };
    if (existing) this.store.update("canvas_recurrences", rid, { ...fields, deleted_at: null });
    else this.store.create("canvas_recurrences", { id: rid, ...fields });
    // The task itself becomes today's occurrence.
    this.store.update("canvas_tasks", task.id, { recurrence_id: rid, occurrence_date: startDate, carry: false });
    return rid;
  }
  stopRecurring(recurrenceId: string) {
    this.store.update("canvas_recurrences", recurrenceId, { active: false });
  }
}
