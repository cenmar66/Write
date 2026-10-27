// IndexedDB layout for one signed-in person (or "local" in dev-only local mode).
import { openDB, type IDBPDatabase } from "idb";
import { SYNCED_TABLES } from "./types";

export const LOCAL_STORES = ["outbox", "shadow", "meta", "ext_events", "conflicts"] as const;
const DB_VERSION = 1;

export type CanvasDB = IDBPDatabase<unknown>;

export async function openCanvasDB(userKey: string): Promise<CanvasDB> {
  return openDB(`daily-canvas-${userKey}`, DB_VERSION, {
    upgrade(db) {
      for (const t of SYNCED_TABLES) {
        if (!db.objectStoreNames.contains(t)) {
          const s = db.createObjectStore(t, { keyPath: "id" });
          if (t === "canvas_ink") s.createIndex("date", "date");
        }
      }
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "key" });
      if (!db.objectStoreNames.contains("shadow")) db.createObjectStore("shadow", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("ext_events")) {
        const s = db.createObjectStore("ext_events", { keyPath: "key" });
        s.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains("conflicts")) db.createObjectStore("conflicts", { keyPath: "key" });
    },
  });
}

export async function deleteCanvasDB(userKey: string) {
  const { deleteDB } = await import("idb");
  await deleteDB(`daily-canvas-${userKey}`);
}
