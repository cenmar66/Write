import { requireOwner } from "@/lib/ai/server";
import { googleConfigured, rateLimited } from "@/lib/canvas/google";

/** Signed-in owner + configured Google + a light rate limit. */
export async function guard(limit = 30) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth;
  const { data } = await auth.supabase.auth.getClaims();
  const userId = data?.claims?.sub as string;
  if (rateLimited(`g:${userId}`, limit)) return { denied: Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429 }) };
  if (!googleConfigured()) return { denied: Response.json({ error: "Google isn't set up on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." }, { status: 503 }) };
  return { supabase: auth.supabase, userId };
}

export function fail(e: unknown, status = 502) {
  const message = e instanceof Error ? e.message : String(e);
  return Response.json({ error: message }, { status });
}
