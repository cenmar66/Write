import { getAccount, gfetch } from "@/lib/canvas/google";
import { fail, guard } from "../_auth";

export async function GET() {
  const g = await guard();
  if ("denied" in g) return g.denied;
  const acc = await getAccount(g.supabase);
  if (!acc) return Response.json({ calendars: [] });
  try {
    const r = await gfetch<{ items?: { id: string; summary: string; primary?: boolean; backgroundColor?: string; accessRole: string }[] }>(
      g.supabase,
      acc,
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
    );
    const calendars = (r.data.items ?? []).map(({ id, summary, primary, backgroundColor, accessRole }) => ({ id, summary, primary, backgroundColor, accessRole }));
    return Response.json({ calendars });
  } catch (e) {
    return fail(e);
  }
}
