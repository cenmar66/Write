import { describe, expect, it } from "vitest";
import { toExternalEvents } from "@/lib/canvas/gcal";
import { decide, fromRemote, toRemote } from "@/lib/canvas/gtasks";
import type { TaskLink } from "@/lib/canvas/types";
import { task } from "./fixtures";

const cal = { id: "primary", summary: "Me" };

describe("Google Calendar events", () => {
  it("places timed events on the local day, across a timezone boundary", () => {
    const ev = [{ id: "a", summary: "Late call", start: { dateTime: "2026-10-28T05:30:00Z" }, end: { dateTime: "2026-10-28T06:00:00Z" } }];
    const la = toExternalEvents(ev, cal, "2026-10-26", "2026-10-29", "America/Los_Angeles");
    expect(la.map((e) => e.date)).toEqual(["2026-10-27"]);
    const madrid = toExternalEvents(ev, cal, "2026-10-26", "2026-10-29", "Europe/Madrid");
    expect(madrid.map((e) => e.date)).toEqual(["2026-10-28"]);
  });

  it("spreads all-day and multi-day events, with Google's exclusive end date", () => {
    const ev = [{ id: "trip", summary: "Trip", start: { date: "2026-10-26" }, end: { date: "2026-10-29" } }];
    const out = toExternalEvents(ev, cal, "2026-10-27", "2026-10-31", "UTC");
    expect(out.map((e) => e.date)).toEqual(["2026-10-27", "2026-10-28"]);
    expect(new Set(out.map((e) => e.key)).size).toBe(2);
    expect(out.every((e) => e.allDay)).toBe(true);
  });

  it("skips cancelled and declined events; stable keys prevent duplicates", () => {
    const ev = [
      { id: "x", status: "cancelled", start: { dateTime: "2026-10-27T10:00:00Z" }, end: { dateTime: "2026-10-27T11:00:00Z" } },
      { id: "y", attendees: [{ self: true, responseStatus: "declined" }], start: { dateTime: "2026-10-27T10:00:00Z" }, end: { dateTime: "2026-10-27T11:00:00Z" } },
      { id: "z", start: { dateTime: "2026-10-27T10:00:00Z" }, end: { dateTime: "2026-10-27T11:00:00Z" } },
    ];
    const out = toExternalEvents(ev, cal, "2026-10-27", "2026-10-27", "UTC");
    expect(out.map((e) => e.key)).toEqual(["primary:z"]);
    expect(toExternalEvents(ev, cal, "2026-10-27", "2026-10-27", "UTC")[0].key).toBe(out[0].key);
  });

  it("flags likely Sunsama time blocks", () => {
    const out = toExternalEvents([{ id: "b", summary: "Deep work", description: "Planned in Sunsama", start: { dateTime: "2026-10-27T16:00:00Z" }, end: { dateTime: "2026-10-27T17:00:00Z" } }], cal, "2026-10-27", "2026-10-27", "UTC");
    expect(out[0].isTimeBlock).toBe(true);
  });
});

const link = (over: Partial<TaskLink> = {}): TaskLink => ({
  id: "l",
  task_id: "t",
  provider: "google_tasks",
  list_id: "L",
  external_id: "g1",
  remote_etag: null,
  remote_updated: "2026-10-27T10:00:00Z",
  local_version_synced: 3,
  state: "linked",
  conflict: null,
  last_synced_at: null,
  created_at: "",
  updated_at: "",
  version: 1,
  deleted_at: null,
  ...over,
});

describe("Google Tasks bridge decisions", () => {
  const t = task("t", { title: "Send invoice", version: 3 });
  const r = { id: "g1", title: "Send invoice", status: "needsAction" as const, updated: "2026-10-27T10:00:00Z" };

  it("creates when not yet exported; does nothing when nothing changed", () => {
    expect(decide(link({ external_id: null }), t, undefined).kind).toBe("create");
    expect(decide(link(), t, r).kind).toBe("none");
  });

  it("pushes local changes and pulls remote changes", () => {
    expect(decide(link(), { ...t, version: 4, status: "done" }, r).kind).toBe("push");
    expect(decide(link(), t, { ...r, status: "completed", updated: "2026-10-27T11:00:00Z" }).kind).toBe("pull");
  });

  it("does not echo its own write back (loop prevention)", () => {
    // After a push we stored the new markers, so the next sync sees no change.
    const after = link({ local_version_synced: 4, remote_updated: "2026-10-27T12:00:00Z" });
    expect(decide(after, { ...t, version: 4 }, { ...r, updated: "2026-10-27T12:00:00Z" }).kind).toBe("none");
  });

  it("flags real conflicts, but not when both sides agree", () => {
    expect(decide(link(), { ...t, version: 4, title: "Send invoice today" }, { ...r, title: "Send invoice ASAP", updated: "2026-10-27T11:00:00Z" }).kind).toBe("conflict");
    expect(decide(link(), { ...t, version: 4, status: "done" }, { ...r, status: "completed", updated: "2026-10-27T11:00:00Z" }).kind).toBe("mark");
    expect(decide(link({ state: "conflict", conflict: { resolve: "remote" } }), t, r).kind).toBe("pull");
  });

  it("never deletes: a task removed in Google marks the link broken", () => {
    expect(decide(link(), t, undefined).kind).toBe("broken");
    expect(decide(link(), t, { ...r, deleted: true }).kind).toBe("broken");
  });

  it("maps fields both ways (due date only, status)", () => {
    expect(toRemote({ ...t, due_date: "2026-11-02", status: "done" })).toMatchObject({ status: "completed", due: "2026-11-02T00:00:00.000Z" });
    expect(fromRemote({ ...r, status: "completed", completed: "2026-10-27T18:00:00Z" }, t, "2026-10-27")).toMatchObject({ status: "done", completed_on: "2026-10-27" });
    expect(fromRemote(r, { ...t, status: "done", completed_on: "2026-10-26" }, "2026-10-27")).toMatchObject({ status: "open", completed_on: null });
  });
});
