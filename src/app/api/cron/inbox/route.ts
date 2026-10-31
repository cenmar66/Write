import { timingSafeEqual } from "node:crypto";
import { drain, scheduleTick } from "@/lib/inbox/server/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * InboxPilot scheduler (Vercel Cron, every 10 minutes — see vercel.json).
 * Enqueues syncs and due briefings, then drains the durable job queue.
 */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let db;
  try {
    db = createAdminClient();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  await scheduleTick(db);
  const results = await drain(db, 45_000);
  return Response.json({ ran: results.length, failed: results.filter((r) => !r.ok).length, results });
}
