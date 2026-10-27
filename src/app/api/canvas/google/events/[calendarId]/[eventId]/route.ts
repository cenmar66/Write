import { isISODate, isValidTimeZone, zonedTimeToUtc } from "@/lib/canvas/dates";
import { audit, getAccount, gfetch } from "@/lib/canvas/google";
import { fail, guard } from "../../../_auth";

type Ctx = { params: Promise<{ calendarId: string; eventId: string }> };
const url = (c: string, e: string) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c)}/events/${encodeURIComponent(e)}`;

/** Change a Google event's title/time/location. The app asks for confirmation first. */
export async function PATCH(request: Request, { params }: Ctx) {
  const g = await guard(20);
  if ("denied" in g) return g.denied;
  const { calendarId, eventId } = await params;
  const b = (await request.json().catch(() => ({}))) as { title?: string; date?: string; start?: string; end?: string; location?: string; timeZone?: string; confirmed?: boolean };
  if (!b.confirmed) return Response.json({ error: "Confirmation required." }, { status: 400 });
  const acc = await getAccount(g.supabase);
  if (!acc?.refresh_token_enc) return Response.json({ error: "Not connected." }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof b.title === "string") patch.summary = b.title.slice(0, 500);
  if (typeof b.location === "string") patch.location = b.location;
  if (isISODate(b.date) && b.start && b.end && isValidTimeZone(b.timeZone ?? "")) {
    patch.start = { dateTime: zonedTimeToUtc(b.date, b.start, b.timeZone!).toISOString(), timeZone: b.timeZone };
    patch.end = { dateTime: zonedTimeToUtc(b.date, b.end, b.timeZone!).toISOString(), timeZone: b.timeZone };
  }
  try {
    const r = await gfetch<{ id: string }>(g.supabase, acc, url(calendarId, eventId), { method: "PATCH", body: JSON.stringify(patch) });
    if (r.status === 404 || r.status === 410) return Response.json({ error: "That event no longer exists in Google Calendar." }, { status: 404 });
    await audit(g.supabase, "google_calendar", "update_event", "ok", { eventId });
    return Response.json({ ok: true });
  } catch (e) {
    await audit(g.supabase, "google_calendar", "update_event", "error", { eventId, message: e instanceof Error ? e.message : String(e) });
    return fail(e);
  }
}

/** Delete a Google event — only from an explicit, confirmed request (never as a side effect). */
export async function DELETE(request: Request, { params }: Ctx) {
  const g = await guard(20);
  if ("denied" in g) return g.denied;
  const { calendarId, eventId } = await params;
  if (new URL(request.url).searchParams.get("confirmed") !== "1") return Response.json({ error: "Confirmation required." }, { status: 400 });
  const acc = await getAccount(g.supabase);
  if (!acc?.refresh_token_enc) return Response.json({ error: "Not connected." }, { status: 400 });
  try {
    await gfetch(g.supabase, acc, url(calendarId, eventId), { method: "DELETE" });
    await audit(g.supabase, "google_calendar", "delete_event", "ok", { eventId });
    return Response.json({ ok: true });
  } catch (e) {
    await audit(g.supabase, "google_calendar", "delete_event", "error", { eventId, message: e instanceof Error ? e.message : String(e) });
    return fail(e);
  }
}
