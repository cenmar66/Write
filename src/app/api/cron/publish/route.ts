import { claimAndPublish } from "@/lib/publish";
import { AUTO_PLATFORMS } from "@/lib/publish/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Called by Vercel Cron (daily, see vercel.json) or a Supabase pg_cron timer, with the CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    console.error("Scheduler not configured", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
  const { data: due } = await supabase
    .from("posts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .in("platform", AUTO_PLATFORMS)
    .order("scheduled_at")
    .limit(10);

  const results = [];
  for (const { id } of due ?? []) {
    results.push({ id, ...(await claimAndPublish(supabase, id, ["scheduled"])) });
  }
  return Response.json({ checked: due?.length ?? 0, results });
}
