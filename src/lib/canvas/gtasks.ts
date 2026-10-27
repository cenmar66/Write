// Google Tasks bridge: deciding what to do for each linked task (pure, unit-tested).
//
// Loop prevention: after every successful push or pull we record BOTH markers —
// the local task version and Google's `updated` stamp — as "in sync". A change only
// counts if the marker moved since then, so our own writes never bounce back.

import type { ISODate, Task, TaskLink } from "./types";

export interface GTask {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string; // RFC3339; Google Tasks keeps only the date
  completed?: string;
  updated?: string;
  deleted?: boolean;
  hidden?: boolean;
  parent?: string;
  etag?: string;
}

export type Decision =
  | { kind: "create" }
  | { kind: "push" }
  | { kind: "pull" }
  | { kind: "none" }
  | { kind: "conflict" }
  | { kind: "broken" }
  | { kind: "mark" }; // both changed to the same thing: just update markers

/** The fields we sync, in a comparable shape. */
export function localShape(t: Task) {
  return { title: t.title.trim(), notes: (t.notes ?? "").trim(), done: t.status === "done", due: t.due_date ?? null };
}
export function remoteShape(r: GTask) {
  return { title: (r.title ?? "").trim(), notes: (r.notes ?? "").trim(), done: r.status === "completed", due: r.due ? r.due.slice(0, 10) : null };
}
const same = (a: ReturnType<typeof localShape>, b: ReturnType<typeof remoteShape>) =>
  a.title === b.title && a.notes === b.notes && a.done === b.done && a.due === b.due;

export function decide(link: TaskLink, task: Task, remote: GTask | undefined): Decision {
  if (!link.external_id) return { kind: "create" };
  if (!remote || remote.deleted) return { kind: "broken" };
  const resolve = (link.conflict as { resolve?: string } | null)?.resolve;
  if (resolve === "local") return { kind: "push" };
  if (resolve === "remote") return { kind: "pull" };
  if (link.state === "conflict") return { kind: "conflict" };
  const localChanged = task.version !== link.local_version_synced;
  const remoteChanged = remote.updated !== link.remote_updated;
  if (!localChanged && !remoteChanged) return { kind: "none" };
  if (localChanged && !remoteChanged) return same(localShape(task), remoteShape(remote)) ? { kind: "mark" } : { kind: "push" };
  if (!localChanged && remoteChanged) return same(localShape(task), remoteShape(remote)) ? { kind: "mark" } : { kind: "pull" };
  return same(localShape(task), remoteShape(remote)) ? { kind: "mark" } : { kind: "conflict" };
}

/** Body for creating/updating the Google task from ours. */
export function toRemote(t: Task): Partial<GTask> {
  return {
    title: t.title.slice(0, 1024),
    notes: t.notes ? t.notes.slice(0, 8192) : undefined,
    status: t.status === "done" ? "completed" : "needsAction",
    due: t.due_date ? `${t.due_date}T00:00:00.000Z` : undefined,
  };
}

/** Patch for our task from Google's (status changes also need a ledger event). */
export function fromRemote(r: GTask, t: Task, today: ISODate): Partial<Task> {
  const s = remoteShape(r);
  const patch: Partial<Task> = {};
  if (s.title && s.title !== t.title) patch.title = s.title;
  if (s.notes !== (t.notes ?? "").trim()) patch.notes = s.notes;
  if (s.due !== (t.due_date ?? null)) patch.due_date = s.due;
  if (s.done && t.status !== "done") {
    patch.status = "done";
    patch.completed_at = r.completed ?? new Date().toISOString();
    patch.completed_on = today;
  } else if (!s.done && t.status === "done") {
    patch.status = "open";
    patch.completed_at = null;
    patch.completed_on = null;
  }
  return patch;
}
