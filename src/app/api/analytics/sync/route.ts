import { requireOwner } from "@/lib/ai/server";
import { syncAnalytics } from "@/lib/analytics/sync";

export const maxDuration = 300;

/** Refresh: pulls your latest posts, stats, comments and followers from connected accounts. */
export async function POST() {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { data } = await auth.supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results = await syncAnalytics(auth.supabase, userId);
  return Response.json({ results });
}
