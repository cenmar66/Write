// Task-integration adapters. Google Tasks is the only live one; the shape below is what a
// future official Sunsama API (or any other task service) would implement, so it can be
// added without changing the planner, the link table (canvas_task_links.provider) or the
// sync rules in gtasks.ts (markers on both sides, never delete, conflicts go to the person).

import type { Task, TaskLink } from "./types";

export interface RemoteTask {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  due: string | null; // YYYY-MM-DD
  updated: string; // provider's change marker
  deleted?: boolean;
}

export interface TaskAdapter {
  provider: TaskLink["provider"] | "sunsama";
  /** What actually syncs, shown to the person in Settings. Never overstate it. */
  capabilities: { title: boolean; notes: boolean; due: "date" | "datetime" | false; completion: "two-way" | "to-remote" | "from-remote" | false; import: boolean };
  list(): Promise<RemoteTask[]>;
  create(task: Task): Promise<RemoteTask>;
  update(externalId: string, task: Task): Promise<RemoteTask>;
}

/** Status of every integration the planner knows about, real or not. */
export const INTEGRATIONS: { provider: string; name: string; status: "available" | "unavailable"; note: string }[] = [
  { provider: "google_calendar", name: "Google Calendar", status: "available", note: "Read events from chosen calendars; create, edit or delete only when you confirm." },
  { provider: "google_tasks", name: "Google Tasks", status: "available", note: "Two-way for linked tasks: title, notes, due date (date only), done." },
  {
    provider: "sunsama",
    name: "Sunsama (direct)",
    status: "unavailable",
    note: "Sunsama has no public API. Works today through Google Calendar time blocks and the Google Tasks bridge.",
  },
];
