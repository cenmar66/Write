// Pure conversion of Google Calendar events into planner rows (unit-tested).
import { addDays, localDateOf } from "./dates";
import type { ExternalEvent, ISODate } from "./types";

export interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  transparency?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  source?: { title?: string; url?: string };
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
}

export interface GCalendar {
  id: string;
  summary: string;
  backgroundColor?: string;
}

/** Heuristic, not a guarantee: blocks written by Sunsama (or similar planners). */
export function looksLikeTimeBlock(e: GEvent, cal: GCalendar): boolean {
  const hay = [cal.summary, e.description, e.source?.title, e.source?.url, JSON.stringify(e.extendedProperties ?? {})].join(" ");
  return /sunsama|time ?block/i.test(hay);
}

/**
 * One row per local day the event touches, inside [from, to].
 * All-day events use their own dates (Google's end date is exclusive).
 * Timed events are placed by their start/end in the planner's timezone.
 * Cancelled events and invitations you declined are skipped.
 */
export function toExternalEvents(events: GEvent[], cal: GCalendar, from: ISODate, to: ISODate, tz: string): ExternalEvent[] {
  const out: ExternalEvent[] = [];
  for (const e of events) {
    if (e.status === "cancelled") continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    const allDay = !!e.start?.date;
    let first: ISODate;
    let last: ISODate;
    if (allDay) {
      first = e.start!.date!;
      last = addDays(e.end?.date ?? addDays(first, 1), -1);
    } else {
      if (!e.start?.dateTime) continue;
      first = localDateOf(e.start.dateTime, tz);
      const endMs = new Date(e.end?.dateTime ?? e.start.dateTime).getTime();
      last = localDateOf(Math.max(endMs - 1, new Date(e.start.dateTime).getTime()), tz);
    }
    const multi = first !== last;
    for (let d = first < from ? from : first; d <= last && d <= to; d = addDays(d, 1)) {
      out.push({
        key: `${cal.id}:${e.id}${multi ? `:${d}` : ""}`,
        calendarId: cal.id,
        calendarName: cal.summary,
        calendarColor: cal.backgroundColor,
        eventId: e.id,
        title: e.summary || "(busy)",
        location: e.location,
        start: allDay ? e.start!.date! : e.start!.dateTime!,
        end: allDay ? e.end?.date ?? e.start!.date! : e.end?.dateTime ?? e.start!.dateTime!,
        allDay,
        htmlLink: e.htmlLink,
        isTimeBlock: looksLikeTimeBlock(e, cal),
        date: d,
      });
    }
  }
  return out;
}
