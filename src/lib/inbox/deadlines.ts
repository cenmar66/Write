// Finds dates in email text and says whether each one is an explicit deadline
// ("by Friday", "due Nov 3") or only a date that was mentioned (inferred).
// Urgency words alone ("URGENT!!!") never create a deadline.

import * as chrono from "chrono-node";

export interface FoundDate {
  date: string;        // ISO
  phrase: string;      // the matched words, e.g. "by Friday"
  sentence: string;    // the sentence it came from (evidence shown to the user)
  explicit: boolean;   // anchored by a deadline word
}

const DEADLINE_BEFORE = /\b(by|due|before|until|no later than|deadline(?: is)?|due date(?: is)?|expires?(?: on)?|para el|antes del?|a más tardar|vence(?: el)?|hasta el)\s*(the\s+|el\s+)?$/i;
const DEADLINE_ANYWHERE = /\b(deadline|due|expires?|a más tardar|vence|fecha límite)\b/i;

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?¿¡])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function findDates(text: string, ref: Date, lang: "en" | "es" | "auto" = "auto"): FoundDate[] {
  if (!text) return [];
  const out: FoundDate[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences(text.slice(0, 8000))) {
    const parsers = lang === "es" ? [chrono.es] : lang === "en" ? [chrono.en] : [chrono.en, chrono.es];
    for (const p of parsers) {
      for (const r of p.parse(sentence, ref, { forwardDate: true })) {
        const before = sentence.slice(0, r.index);
        const explicit = DEADLINE_BEFORE.test(before) || (DEADLINE_ANYWHERE.test(sentence) && sentence.length < 220);
        const d = r.start.date();
        if (!r.start.isCertain("day") && !r.start.isCertain("weekday")) continue; // "at 5pm" alone is too vague
        const key = d.toISOString().slice(0, 10) + sentence;
        if (seen.has(key)) continue;
        seen.add(key);
        const lead = before.match(/(\S+\s+){0,2}$/)?.[0] ?? "";
        out.push({ date: d.toISOString(), phrase: (lead + r.text).trim(), sentence: sentence.slice(0, 280), explicit });
      }
    }
  }
  return out;
}

/** The earliest explicit future deadline, if any. */
export function firstDeadline(text: string, ref: Date): FoundDate | null {
  const list = findDates(text, ref).filter((d) => d.explicit && new Date(d.date).getTime() >= ref.getTime() - 86_400_000);
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list[0] ?? null;
}

/** Adds business days (Mon–Fri) to a date. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export function businessDaysBetween(a: Date, b: Date): number {
  let n = 0;
  const d = new Date(a);
  while (d < b) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d > b) break;
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
