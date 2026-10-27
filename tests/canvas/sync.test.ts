// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Planner } from "@/lib/canvas/actions";
import { CanvasStore } from "@/lib/canvas/store";
import { SyncEngine } from "@/lib/canvas/sync";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeServer } from "./fake-server";

let n = 0;
async function device(server: FakeServer, user = "u1") {
  // Each device has its own IndexedDB (unique name per test device).
  const store = new CanvasStore(`${user}-${++n}`);
  await store.load();
  const planner = new Planner(store, user);
  const sync = new SyncEngine(store, server.client() as unknown as SupabaseClient, user);
  return { store, planner, sync };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { onLine: true });
});

describe("sync between devices", () => {
  it("a task made on one device appears on the other, once", async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    a.planner.addTask("2026-10-27", "must", "Write report");
    await a.store.flush();
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(b.store.all("canvas_tasks").map((t) => t.title)).toEqual(["Write report"]);
    expect(b.planner.tasksFor("2026-10-27", "must")).toHaveLength(1);
    // Syncing again changes nothing.
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(server.rows("canvas_tasks")).toHaveLength(1);
    expect(b.store.all("canvas_task_placements")).toHaveLength(1);
  });

  it("offline edits queue up and replay after reconnecting", async () => {
    const server = new FakeServer();
    const a = await device(server);
    server.online = false;
    const t = a.planner.addTask("2026-10-27", "work", "Offline task");
    a.planner.toggleComplete(a.store.get("canvas_tasks", t.id)!, "2026-10-27");
    await a.sync.syncNow();
    expect(a.store.pendingCount()).toBeGreaterThan(0);
    expect(server.rows("canvas_tasks")).toHaveLength(0);
    server.online = true;
    await a.sync.syncNow();
    expect(a.store.pendingCount()).toBe(0);
    expect(server.rows("canvas_tasks")[0]).toMatchObject({ title: "Offline task", status: "done" });
    expect(server.rows("canvas_task_events").map((e) => e.kind).sort()).toEqual(["completed", "created"]);
  });

  it("the outbox survives an app restart (IndexedDB)", async () => {
    const server = new FakeServer();
    server.online = false;
    const a = await device(server);
    a.planner.addTask("2026-10-27", "work", "Persisted");
    await a.store.flush();
    const reopened = new CanvasStore(a.store.userKey);
    await reopened.load();
    expect(reopened.pendingCount()).toBe(a.store.pendingCount());
    server.online = true;
    await new SyncEngine(reopened, server.client() as unknown as SupabaseClient, "u1").syncNow();
    expect(server.rows("canvas_tasks")[0]).toMatchObject({ title: "Persisted" });
  });

  it("simultaneous note edits on two devices: nothing is overwritten, a conflict is raised", async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    a.planner.setNote("2026-10-27", "first draft");
    await a.sync.syncNow();
    await b.sync.syncNow();
    // Both edit from the same starting point.
    a.planner.setNote("2026-10-27", "edited on the Mac");
    b.planner.setNote("2026-10-27", "edited on the iPhone");
    await a.sync.syncNow();
    await b.sync.syncNow();
    const note = server.rows("canvas_notes")[0];
    expect(note.body).toBe("edited on the Mac");
    const conflicts = b.store.conflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: "body", mine: "edited on the iPhone", server: "edited on the Mac" });
    // Keep both: merged text wins everywhere.
    b.store.resolveConflict(conflicts[0].key, "both");
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.planner.noteFor("2026-10-27")!.body).toContain("edited on the Mac");
    expect(a.planner.noteFor("2026-10-27")!.body).toContain("edited on the iPhone");
  });

  it("non-text fields merge (last writer wins per field) without conflicts", async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    const t = a.planner.addTask("2026-10-27", "work", "Shared");
    await a.sync.syncNow();
    await b.sync.syncNow();
    a.planner.updateTask(t.id, { priority: 3 });
    b.planner.updateTask(t.id, { due_date: "2026-11-01" });
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.store.get("canvas_tasks", t.id)).toMatchObject({ priority: 3, due_date: "2026-11-01" });
    expect(b.store.conflicts()).toHaveLength(0);
  });

  it("rollover on two devices for the same day never duplicates", async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    a.planner.addTask("2026-10-25", "work", "Carry me");
    await a.sync.syncNow();
    await b.sync.syncNow();
    a.planner.planDay("2026-10-27");
    b.planner.planDay("2026-10-27");
    b.planner.planDay("2026-10-27");
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    const today = server.rows("canvas_task_placements").filter((p) => p.date === "2026-10-27");
    expect(today).toHaveLength(1);
    expect(server.rows("canvas_task_events").filter((e) => e.kind === "carried")).toHaveLength(1);
    expect(a.planner.tasksFor("2026-10-27", "work")).toHaveLength(1);
  });

  it("pending local edits stay on screen when an older server row arrives", async () => {
    const server = new FakeServer();
    const a = await device(server);
    const t = a.planner.addTask("2026-10-27", "work", "Title");
    await a.sync.syncNow();
    server.online = false;
    a.planner.updateTask(t.id, { priority: 2 });
    // Server row (without the edit) is applied, e.g. from a realtime pull.
    a.store.applyServerRows("canvas_tasks", [server.rows("canvas_tasks")[0]]);
    expect(a.store.get("canvas_tasks", t.id)!.priority).toBe(2);
  });

  it("separate accounts never see each other's data", async () => {
    const s1 = new FakeServer();
    const s2 = new FakeServer();
    const me = await device(s1, "me");
    const other = await device(s2, "other");
    me.planner.addTask("2026-10-27", "work", "Mine");
    await me.sync.syncNow();
    await other.sync.syncNow();
    expect(other.store.all("canvas_tasks")).toHaveLength(0);
    expect(me.store.userKey).not.toBe(other.store.userKey);
  });
});
