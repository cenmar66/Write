import { requireOwner } from "@/lib/ai/server";
import { getAccount, googleConfigured, hasScope, SCOPES } from "@/lib/canvas/google";

export async function GET() {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const acc = googleConfigured() ? await getAccount(auth.supabase) : null;
  const connected = !!acc?.refresh_token_enc;
  return Response.json(
    {
      configured: googleConfigured(),
      connected,
      email: acc?.google_email ?? null,
      canReadCalendar: connected && hasScope(acc, SCOPES.calendar[1]),
      canWriteCalendar: connected && hasScope(acc, SCOPES.calendar[1]),
      canTasks: connected && hasScope(acc, SCOPES.tasks[0]),
      selectedCalendars: acc?.selected_calendars ?? [],
      tasksListId: acc?.tasks_list_id ?? null,
      tasksSettings: acc?.tasks_settings ?? {},
      lastCalendarSync: acc?.last_calendar_sync ?? null,
      lastTasksSync: acc?.last_tasks_sync ?? null,
      lastError: acc?.last_error ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
