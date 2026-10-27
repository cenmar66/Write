import { audit, getAccount, gfetch } from "@/lib/canvas/google";
import { fail, guard } from "../_auth";

/** Save calendar selection, the Google Tasks list, and bridge options. */
export async function POST(request: Request) {
  const g = await guard();
  if ("denied" in g) return g.denied;
  const acc = await getAccount(g.supabase);
  if (!acc) return Response.json({ error: "Connect Google first." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { selectedCalendars?: unknown; tasksListId?: unknown; tasksSettings?: unknown };
  const patch: Record<string, unknown> = {};
  if (Array.isArray(body.selectedCalendars)) patch.selected_calendars = body.selectedCalendars.filter((x) => typeof x === "string").slice(0, 50);
  if (body.tasksSettings && typeof body.tasksSettings === "object") {
    const s = body.tasksSettings as Record<string, unknown>;
    patch.tasks_settings = {
      importEnabled: !!s.importEnabled,
      importSection: ["work", "personal", "must"].includes(String(s.importSection)) ? s.importSection : "work",
    };
  }
  if (body.tasksListId === null || typeof body.tasksListId === "string") {
    let listId = body.tasksListId as string | null;
    if (listId === "__create__") {
      try {
        const r = await gfetch<{ id: string }>(g.supabase, acc, "https://tasks.googleapis.com/tasks/v1/users/@me/lists", { method: "POST", body: JSON.stringify({ title: "Daily Canvas" }) });
        listId = r.data.id;
        await audit(g.supabase, "google_tasks", "create_list", "ok", { listId });
      } catch (e) {
        return fail(e);
      }
    }
    patch.tasks_list_id = listId;
  }
  const { error } = await g.supabase.from("canvas_google_accounts").update(patch).eq("user_id", g.userId);
  if (error) return fail(error.message, 500);
  return Response.json({ ok: true });
}
