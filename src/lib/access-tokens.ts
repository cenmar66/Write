import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";

export type Scope = "read" | "write";

/** A new random code. Shown to you once; only its hash is stored. */
export function newToken() {
  const token = `wai_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type Caller = { supabase: SupabaseClient; userId: string; scope: Scope };

/**
 * Checks the "Authorization: Bearer wai_…" header.
 * Returns a database client limited by the caller's user id, or an error response.
 */
export async function authenticate(request: Request, need: Scope): Promise<Caller | { denied: Response }> {
  const deny = (status: number, error: string) => ({ denied: Response.json({ error }, { status }) });
  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(wai_[A-Za-z0-9_-]+)$/)?.[1];
  if (!token) return deny(401, "Missing access code. Send it as: Authorization: Bearer wai_…");

  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient();
  } catch {
    return deny(500, "The server is missing SUPABASE_SECRET_KEY, so access codes can't be checked yet.");
  }
  const { data: row } = await supabase
    .from("access_tokens")
    .select("id,user_id,scope,expires_at,revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!row || row.revoked_at) return deny(401, "This access code isn't valid (it may have been revoked).");
  if (row.expires_at && new Date(row.expires_at) < new Date()) return deny(401, "This access code has expired.");
  if (need === "write" && row.scope !== "write") return deny(403, "This access code is read-only.");

  await supabase.from("access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return { supabase, userId: row.user_id as string, scope: row.scope as Scope };
}
