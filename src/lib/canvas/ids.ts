import { v4, v5 } from "uuid";

// Fixed namespace for Daily Canvas deterministic ids. Never change it: devices rely on
// computing the same id for "this task on this day" to avoid duplicates.
const NAMESPACE = "6f1d3a52-6c1b-4f0e-9a8e-1d2c0b7a9e44";

export const newId = (): string => v4();

/** Same inputs → same id on every device. */
export const stableId = (...parts: string[]): string => v5(parts.join("|"), NAMESPACE);

export const placementId = (taskId: string, date: string) => stableId("placement", taskId, date);
export const noteId = (userKey: string, date: string) => stableId("note", userKey, date);
export const waterId = (userKey: string, date: string) => stableId("water", userKey, date);
export const dayMetaId = (userKey: string, date: string) => stableId("day", userKey, date);
export const mealId = (userKey: string, date: string, slot: string) => stableId("meal", userKey, date, slot);
export const prefsId = (userKey: string) => stableId("prefs", userKey);
export const occurrenceId = (recurrenceId: string, date: string) => stableId("occurrence", recurrenceId, date);
