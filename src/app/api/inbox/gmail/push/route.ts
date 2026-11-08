import { after } from "next/server";
import { parsePushBody, pushConfig, verifyPushToken } from "@/lib/inbox/push";
import { drain, enqueue } from "@/lib/inbox/server/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Gmail push (via Google Cloud Pub/Sub): "this mailbox changed". Verified as Google's,
 * then the mailbox is synced right away (after answering, so Pub/Sub isn't kept waiting).
 * Nothing here reads mail itself; the regular sync does that, with all its rules.
 */
export async function POST(request: Request) {
  const cfg = pushConfig();
  if (!cfg) return Response.json({ error: "Instant updates aren't configured." }, { status: 404 });
  const auth = request.headers.get("authorization") ?? "";
  try {
    await verifyPushToken(auth.replace(/^Bearer\s+/i, ""), cfg);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const note = parsePushBody(await request.json().catch(() => null));
  // Malformed notifications are acknowledged (2xx) so Pub/Sub doesn't retry them forever.
  if (!note) return Response.json({ ok: true, ignored: true });
  let db;
  try {
    db = createAdminClient();
  } catch {
    return Response.json({ error: "Server isn't configured." }, { status: 503 });
  }
  const { data: accounts } = await db.from("ip_accounts").select("id,workspace_id,status,email").eq("provider", "gmail").ilike("email", note.emailAddress);
  const live = (accounts ?? []).filter((a) => String(a.email).toLowerCase() === note.emailAddress && !["paused", "needs_reconnect"].includes(a.status as string));
  for (const a of live) await enqueue(db, { kind: "sync", key: `push:${a.id}:${note.historyId || Date.now()}`, workspace_id: a.workspace_id, account_id: a.id });
  if (live.length) after(() => drain(db, 40_000).then(() => undefined));
  return Response.json({ ok: true, accounts: live.length });
}
