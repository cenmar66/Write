import type { Placement, Task } from "@/lib/canvas/types";
import { placementId } from "@/lib/canvas/ids";

const meta = { created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", version: 1, deleted_at: null };

export function task(id: string, over: Partial<Task> = {}): Task {
  return {
    ...meta,
    id,
    section: "work",
    title: id,
    notes: "",
    priority: 0,
    label: null,
    due_date: null,
    estimate_min: null,
    actual_min: null,
    scheduled_time: null,
    parent_id: null,
    status: "open",
    completed_at: null,
    completed_on: null,
    origin_date: "2026-10-20",
    backlog: false,
    carry: true,
    recurrence_id: null,
    occurrence_date: null,
    contact_name: null,
    contact_info: null,
    follow_up_date: null,
    quantity: null,
    source: "local",
    ...over,
  };
}

export function placed(taskId: string, date: string, over: Partial<Placement> = {}): Placement {
  return {
    ...meta,
    id: placementId(taskId, date),
    task_id: taskId,
    date,
    section: "work",
    position: 1,
    carried: false,
    removed: false,
    ...over,
  };
}

export const stamp = <T extends object>(draft: T) => ({ ...meta, ...draft });
