// Personal data export. JSON contains every record (including deleted ones and the
// completion ledger). CSVs are flattened per kind, with timestamps also given in the
// planner's timezone so they read naturally in a spreadsheet.

import { localDateOf, localTimeOf } from "./dates";
import type { CanvasStore } from "./store";
import type { TableName } from "./types";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

const local = (iso: unknown, tz: string) => (typeof iso === "string" && iso ? `${localDateOf(iso, tz)} ${localTimeOf(iso, tz)}` : "");

export const CSV_KINDS: { key: string; label: string; table: TableName }[] = [
  { key: "tasks", label: "Tasks", table: "canvas_tasks" },
  { key: "task-days", label: "Tasks by day", table: "canvas_task_placements" },
  { key: "task-history", label: "Task history", table: "canvas_task_events" },
  { key: "appointments", label: "Appointments", table: "canvas_appointments" },
  { key: "good-things", label: "Good things", table: "canvas_journal" },
  { key: "ideas", label: "Big ideas", table: "canvas_ideas" },
  { key: "notes", label: "Notes", table: "canvas_notes" },
  { key: "exercise", label: "Exercise", table: "canvas_exercise" },
  { key: "meals", label: "Meals", table: "canvas_meals" },
  { key: "water", label: "Water", table: "canvas_water" },
];

export function buildCSV(store: CanvasStore, key: string, tz: string): string {
  const kind = CSV_KINDS.find((k) => k.key === key)!;
  const titles = new Map(store.allWithDeleted("canvas_tasks").map((t) => [t.id, t.title]));
  const rows = (store.allWithDeleted(kind.table) as unknown as Record<string, unknown>[]).map((r) => {
    const { user_id: _u, sync_seq: _s, version: _v, ...rest } = r;
    void _u; void _s; void _v;
    const out: Record<string, unknown> = { ...rest };
    for (const f of ["created_at", "updated_at", "completed_at", "deleted_at", "at", "closed_at"]) if (f in out) out[`${f}_local`] = local(out[f], tz);
    if ("task_id" in out) out.task_title = titles.get(String(out.task_id)) ?? "";
    if ("points" in out) delete out.points;
    return out;
  });
  rows.sort((a, b) => String(a.date ?? a.origin_date ?? a.created_at).localeCompare(String(b.date ?? b.origin_date ?? b.created_at)));
  return toCSV(rows);
}

export async function buildJSON(store: CanvasStore, tz: string) {
  return JSON.stringify(
    { app: "The Daily Canvas", exported_at: new Date().toISOString(), timezone: tz, format_version: 1, data: await store.exportAll() },
    null,
    2,
  );
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
