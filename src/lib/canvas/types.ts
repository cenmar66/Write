// Record shapes for The Daily Canvas. They mirror supabase/migrations/0009_daily_canvas.sql.

export type ISODate = string; // 'YYYY-MM-DD' local calendar date
export type TaskSection = "must" | "work" | "personal" | "comms" | "shopping";

export interface BaseRecord {
  id: string;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
  version: number; // last server version this device saw (0 = never synced)
  deleted_at: string | null;
  sync_seq?: number;
}

export interface Preferences extends BaseRecord {
  timezone: string;
  theme: "system" | "light" | "dark";
  sound: boolean;
  animations: boolean;
  density: "compact" | "comfortable" | "spacious";
  section_order: SectionKey[];
  hidden_sections: SectionKey[];
  section_colors: Partial<Record<SectionKey, string>>;
  color_theme: string;
  water_target: number;
  glass_ml: number;
  carry_shopping: boolean;
  dictation_lang: "en-US" | "es-ES" | "es-MX" | "en-GB";
  ai_interpreter: boolean;
  reminders: ReminderPrefs;
  tagline: string;
}

export interface ReminderPrefs {
  enabled?: boolean;
  appointments?: boolean;
  scheduledTasks?: boolean;
  hydration?: boolean;
  evening?: boolean;
  eveningTime?: string;
  quietStart?: string;
  quietEnd?: string;
  leadMinutes?: number;
}

export interface RecurrenceRule {
  freq: "daily" | "weekdays" | "weekly" | "monthly";
  days?: number[]; // 0 = Sunday, for weekly
  monthDay?: number; // for monthly
  interval?: number; // every N days/weeks/months
}

export interface Recurrence extends BaseRecord {
  section: TaskSection;
  title: string;
  notes: string;
  priority: number;
  label: string | null;
  estimate_min: number | null;
  scheduled_time: string | null;
  rule: RecurrenceRule;
  start_date: ISODate;
  end_date: ISODate | null;
  carry: boolean;
  active: boolean;
}

export interface Task extends BaseRecord {
  section: TaskSection;
  title: string;
  notes: string;
  priority: number; // 0 none, 1 low, 2 medium, 3 high
  label: string | null;
  due_date: ISODate | null;
  estimate_min: number | null;
  actual_min: number | null;
  scheduled_time: string | null;
  parent_id: string | null;
  status: "open" | "done" | "archived";
  completed_at: string | null;
  completed_on: ISODate | null;
  origin_date: ISODate;
  backlog: boolean;
  carry: boolean;
  recurrence_id: string | null;
  occurrence_date: ISODate | null;
  contact_name: string | null;
  contact_info: string | null;
  follow_up_date: ISODate | null;
  quantity: string | null;
  source: string;
}

export interface Placement extends BaseRecord {
  task_id: string;
  date: ISODate;
  section: TaskSection;
  position: number;
  carried: boolean;
  removed: boolean;
}

export type TaskEventKind =
  | "created"
  | "completed"
  | "reopened"
  | "carried"
  | "moved"
  | "rescheduled"
  | "archived"
  | "restored"
  | "deleted"
  | "edited";

export interface TaskEvent extends BaseRecord {
  task_id: string;
  kind: TaskEventKind;
  at: string;
  local_date: ISODate;
  data: Record<string, unknown>;
}

export interface Appointment extends BaseRecord {
  date: ISODate;
  start_time: string | null;
  end_time: string | null;
  title: string;
  location: string | null;
  notes: string;
  attended: boolean;
}

export interface JournalEntry extends BaseRecord {
  date: ISODate;
  body: string;
  position: number;
}

export interface Idea extends BaseRecord {
  date: ISODate;
  body: string;
  tags: string[];
  pinned: boolean;
  converted_task_id: string | null;
}

export interface DailyNote extends BaseRecord {
  date: ISODate;
  body: string;
}

export interface Exercise extends BaseRecord {
  date: ISODate;
  activity: string;
  duration_min: number | null;
  intensity: "easy" | "moderate" | "hard" | null;
  notes: string;
  metrics: Record<string, number>;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export interface Meal extends BaseRecord {
  date: ISODate;
  slot: MealSlot;
  description: string;
  calories: number | null;
}

export interface Water extends BaseRecord {
  date: ISODate;
  glasses: number;
  target: number;
  glass_ml: number;
}

export interface DayMeta extends BaseRecord {
  date: ISODate;
  closed_at: string | null;
  reflection: string;
}

export interface InkStroke extends BaseRecord {
  date: ISODate;
  zone: string;
  tool: "pen" | "highlighter";
  color: string;
  width: number;
  points: number[];
}

export interface TaskLink extends BaseRecord {
  task_id: string;
  provider: "google_tasks";
  list_id: string | null;
  external_id: string | null;
  remote_etag: string | null;
  remote_updated: string | null;
  local_version_synced: number | null;
  state: "pending" | "linked" | "conflict" | "broken";
  conflict: Record<string, unknown> | null;
  last_synced_at: string | null;
}

/** Tables that sync between devices, in a safe apply order (parents first). */
export const SYNCED_TABLES = [
  "canvas_preferences",
  "canvas_recurrences",
  "canvas_tasks",
  "canvas_task_placements",
  "canvas_task_events",
  "canvas_appointments",
  "canvas_journal",
  "canvas_ideas",
  "canvas_notes",
  "canvas_exercise",
  "canvas_meals",
  "canvas_water",
  "canvas_day_meta",
  "canvas_ink",
  "canvas_task_links",
] as const;
export type TableName = (typeof SYNCED_TABLES)[number];

export interface TableTypes {
  canvas_preferences: Preferences;
  canvas_recurrences: Recurrence;
  canvas_tasks: Task;
  canvas_task_placements: Placement;
  canvas_task_events: TaskEvent;
  canvas_appointments: Appointment;
  canvas_journal: JournalEntry;
  canvas_ideas: Idea;
  canvas_notes: DailyNote;
  canvas_exercise: Exercise;
  canvas_meals: Meal;
  canvas_water: Water;
  canvas_day_meta: DayMeta;
  canvas_ink: InkStroke;
  canvas_task_links: TaskLink;
}

/**
 * Text fields where a silent overwrite would lose someone's writing. Edits to these
 * carry the server value they were based on; the server reports a conflict instead
 * of overwriting when the text changed elsewhere in the meantime.
 */
export const PROTECTED_FIELDS: Partial<Record<TableName, string[]>> = {
  canvas_tasks: ["title", "notes"],
  canvas_appointments: ["title", "notes"],
  canvas_journal: ["body"],
  canvas_ideas: ["body"],
  canvas_notes: ["body"],
  canvas_meals: ["description"],
  canvas_exercise: ["notes"],
  canvas_day_meta: ["reflection"],
  canvas_recurrences: ["title", "notes"],
};

export type SectionKey =
  | "must"
  | "appointments"
  | "work"
  | "comms"
  | "journal"
  | "shopping"
  | "personal"
  | "exercise"
  | "meals"
  | "water"
  | "ideas"
  | "notes";

/** A synced external calendar event (cached on the device; read-only here). */
export interface ExternalEvent {
  key: string; // calendarId:eventId (stable, prevents duplicates)
  calendarId: string;
  calendarName: string;
  calendarColor?: string;
  eventId: string;
  title: string;
  location?: string;
  start: string; // ISO date-time, or YYYY-MM-DD when allDay
  end: string;
  allDay: boolean;
  htmlLink?: string;
  isTimeBlock?: boolean; // looks like a task time block (e.g. created by Sunsama)
  date: ISODate; // local date it is shown on
}

export interface Conflict {
  key: string; // table:id:field
  table: TableName;
  id: string;
  field: string;
  mine: unknown;
  server: unknown;
  at: string;
}
