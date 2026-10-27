import { getAccount, gfetch } from "@/lib/canvas/google";
import { fail, guard } from "../../_auth";

export async function GET() {
  const g = await guard();
  if ("denied" in g) return g.denied;
  const acc = await getAccount(g.supabase);
  if (!acc) return Response.json({ lists: [] });
  try {
    const r = await gfetch<{ items?: { id: string; title: string }[] }>(g.supabase, acc, "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100");
    return Response.json({ lists: (r.data.items ?? []).map(({ id, title }) => ({ id, title })) });
  } catch (e) {
    return fail(e);
  }
}
