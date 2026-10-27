// Calendar-date helpers. Planner days are plain local dates ('YYYY-MM-DD') in the
// person's chosen IANA timezone; instants are stored in UTC. Date math happens on the
// date string itself (via UTC noon), so daylight-saving changes can't skip or repeat a day.

import type { ISODate } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export function isISODate(v: unknown): v is ISODate {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
}

/** The local calendar date of an instant in a timezone. */
export function localDateOf(instant: Date | string | number, timeZone: string): ISODate {
  const d = new Date(instant);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  return localDateOf(now, timeZone);
}

/** Local wall-clock 'HH:MM' of an instant in a timezone. */
export function localTimeOf(instant: Date | string | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

function toUTCNoon(date: ISODate): Date {
  return new Date(date + "T12:00:00Z");
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = toUTCNoon(date);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTCNoon(a).getTime() - toUTCNoon(b).getTime()) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(date: ISODate): number {
  return toUTCNoon(date).getUTCDay();
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10));
}

export function daysInMonth(date: ISODate): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Monday of the week containing date. */
export function startOfWeek(date: ISODate): ISODate {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(date: ISODate): ISODate {
  return date.slice(0, 8) + "01";
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatLong(date: ISODate, locale = "en-US"): string {
  return toUTCNoon(date).toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatShort(date: ISODate, locale = "en-US"): string {
  return toUTCNoon(date).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatTime(hhmm: string | null | undefined, locale = "en-US"): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/**
 * The UTC instant for a local date + wall time in a timezone. Handles DST by
 * correcting with the zone's actual offset at that moment. For a wall time that
 * doesn't exist (spring-forward gap) it lands just after the gap.
 */
export function zonedTimeToUtc(date: ISODate, hhmm: string, timeZone: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMinutes(new Date(t), timeZone);
    const next = guess - offset * 60_000;
    if (next === t) break;
    t = next;
  }
  return new Date(t);
}

/** Minutes the zone is ahead of UTC at an instant (e.g. -420 for PDT). */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUTC - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
