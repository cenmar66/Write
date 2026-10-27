import { createHash } from "node:crypto";
import { addDays, isISODate, isValidTimeZone, zonedTimeToUtc } from "@/lib/canvas/dates";
import { toExternalEvents, type GCalendar, type GEvent } from "@/lib/canvas/gcal";
import { audit, getAccount, gfetch } from "@/lib/canvas/google";
import { fail, guard } from "../_auth";

const CAL = "https://www.googleapis.com/calendar/v3";

/** Events from the selected calendars for a date range (local dates in ?tz). */
export async function GET(request: Request) {
  const g = await guard(60);
  if ("denied" in g) return g.denied;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const tz = url.searchParams.get("tz") ?? "UTC";
  if (!isISODate(from) || !isISODate(to) || to < from || !isValidTimeZone(tz)) return Response.json({ error: "Bad range." }, { status: 400 });
  const acc = await getAccount(g.supabase);
  if (!acc?.refresh_token_enc) return Response.json({ events: [] });
  try {
    const list = await gfetch<{ items?: (GCalendar & { primary?: boolean })[] }>(g.supabase, acc, `${CAL}/users/me/calendarList?maxResults=250`);
    const all = list.data.items ?? [];
    const chosen = acc.selected_calendars.length ? all.filter((c) => acc.selected_calendars.includes(c.id)) : all.filter((c) => c.primary);
    const timeMin = zonedTimeToUtc(from, "00:00", tz).toISOString();
    const timeMax = zonedTimeToUtc(addDays(to, 1), "00:00", tz).toISOString();
    const events = (
      await Promise.all(
        chosen.map(async (cal) => {
          const items: GEvent[] = [];
          let pageToken: string | undefined;
          for (let i = 0; i < 5; i++) {
            const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250", timeZone: tz });
            if (pageToken) q.set("pageToken", pageToken);
            const r = await gfetch<{ items?: GEvent[]; nextPageToken?: string }>(g.supabase, acc, `${CAL}/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
            items.push(...(r.data.items ?? []));
            pageToken = r.data.nextPageToken;
            if (!pageToken) break;
          }
          return toExternalEvents(items, cal, from, to, tz);
        }),
      )
    ).flat();
    await g.supabase.from("canvas_google_accounts").update({ last_calendar_sync: new Date().toISOString(), last_error: null }).eq("user_id", g.userId);
    return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    await g.supabase.from("canvas_google_accounts").update({ last_error: e instanceof Error ? e.message : String(e) }).eq("user_id", g.userId);
    return fail(e);
  }
}

/** Create one event on the primary calendar, only when the person asked for it. */
export async function POST(request: Request) {
  const g = await guard(20);
  if ("denied" in g) return g.denied;
  const b = (await request.json().catch(() => ({}))) as { title?: string; date?: string; start?: string; end?: string | null; location?: string | null; notes?: string; timeZone?: string; clientKey?: string };
  if (!b.title?.trim() || !isISODate(b.date) || !/^\d{2}:\d{2}$/.test(b.start ?? "") || !isValidTimeZone(b.timeZone ?? "")) return Response.json({ error: "Missing title, date or time." }, { status: 400 });
  const acc = await getAccount(g.supabase);
  if (!acc?.refresh_token_enc) return Response.json({ error: "Connect Google Calendar first." }, { status: 400 });
  const end = b.end && /^\d{2}:\d{2}$/.test(b.end) && b.end > b.start! ? b.end : null;
  const startUtc = zonedTimeToUtc(b.date, b.start!, b.timeZone!);
  const endUtc = end ? zonedTimeToUtc(b.date, end, b.timeZone!) : new Date(startUtc.getTime() + 60 * 60_000);
  // A stable id from the request makes retries safe: Google answers 409 instead of duplicating.
  const id = createHash("sha256").update(`${g.userId}|${b.clientKey ?? `${b.title}|${b.date}|${b.start}`}`).digest("hex").slice(0, 40);
  try {
    const r = await gfetch<{ id: string; htmlLink: string }>(g.supabase, acc, `${CAL}/calendars/primary/events`, {
      method: "POST",
      body: JSON.stringify({
        id,
        summary: b.title.trim().slice(0, 500),
        location: b.location ?? undefined,
        description: b.notes ? `${b.notes}\n\n(Added from The Daily Canvas)` : "Added from The Daily Canvas",
        start: { dateTime: startUtc.toISOString(), timeZone: b.timeZone },
        end: { dateTime: endUtc.toISOString(), timeZone: b.timeZone },
      }),
    });
    await audit(g.supabase, "google_calendar", "create_event", "ok", { id, duplicate: r.status === 409 });
    return Response.json({ id: r.data.id ?? id, htmlLink: r.data.htmlLink ?? null, duplicate: r.status === 409 });
  } catch (e) {
    await audit(g.supabase, "google_calendar", "create_event", "error", { message: e instanceof Error ? e.message : String(e) });
    return fail(e);
  }
}
