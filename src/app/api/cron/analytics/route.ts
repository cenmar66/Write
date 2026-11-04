import { syncAnalytics } from "@/lib/analytics/sync";
import { ANALYTICS_PLATFORMS } from "@/lib/analytics/sources";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Daily refresh of social stats and comments (see vercel.json), with the CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
  const { data } = await supabase.from("connected_accounts").select("user_id").in("platform", ANALYTICS_PLATFORMS).eq("status", "connected");
  const users = [...new Set((data ?? []).map((r) => r.user_id as string))];
  const results = [];
  for (const userId of users) results.push({ userId, results: await syncAnalytics(supabase, userId) });
  return Response.json({ users: users.length, results });
}
