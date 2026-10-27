import type { SectionKey, TaskSection } from "./types";

export interface SectionDef {
  key: SectionKey;
  title: string;
  short: string;
  /** Which page of the open notebook it sits on by default. */
  page: "left" | "right";
  taskSection?: TaskSection;
  annotatable?: boolean;
}

// Order follows the paper planner: left page, then right page.
export const SECTIONS: SectionDef[] = [
  { key: "must", title: "Must Do Today", short: "Must Do", page: "left", taskSection: "must", annotatable: true },
  { key: "appointments", title: "Appointments", short: "Appts", page: "left", annotatable: true },
  { key: "work", title: "Work To-Dos", short: "Work", page: "left", taskSection: "work", annotatable: true },
  { key: "comms", title: "Emails / Calls", short: "Emails", page: "left", taskSection: "comms", annotatable: true },
  { key: "journal", title: "Good Things That Happened", short: "Good Things", page: "left", annotatable: true },
  { key: "shopping", title: "To Buy", short: "To Buy", page: "left", taskSection: "shopping", annotatable: true },
  { key: "personal", title: "Personal To-Dos", short: "Personal", page: "right", taskSection: "personal", annotatable: true },
  { key: "exercise", title: "Exercise", short: "Exercise", page: "right", annotatable: true },
  { key: "meals", title: "Meals / Calories", short: "Meals", page: "right", annotatable: true },
  { key: "water", title: "8 Glasses a Day", short: "Water", page: "right" },
  { key: "ideas", title: "Big Ideas", short: "Ideas", page: "right", annotatable: true },
  { key: "notes", title: "Notes", short: "Notes", page: "right", annotatable: true },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<SectionKey, SectionDef>;
export const DEFAULT_ORDER: SectionKey[] = SECTIONS.map((s) => s.key);

export const TASK_SECTION_TITLES: Record<TaskSection, string> = {
  must: "Must Do Today",
  work: "Work To-Dos",
  personal: "Personal To-Dos",
  comms: "Emails / Calls",
  shopping: "To Buy",
};

/** Saved order + any sections added in later versions, minus unknown keys. */
export function resolveOrder(saved: SectionKey[] | undefined): SectionKey[] {
  const known = new Set(DEFAULT_ORDER);
  const seen = new Set<SectionKey>();
  const out: SectionKey[] = [];
  for (const k of saved ?? []) if (known.has(k) && !seen.has(k)) (seen.add(k), out.push(k));
  for (const k of DEFAULT_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}
