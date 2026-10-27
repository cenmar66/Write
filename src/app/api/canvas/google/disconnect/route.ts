import { requireOwner } from "@/lib/ai/server";
import { audit, getAccount } from "@/lib/canvas/google";
import { decrypt } from "@/lib/crypto";

/** Revoke Google's grant and forget the tokens. Planner data is untouched. */
export async function POST() {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const acc = await getAccount(auth.supabase);
  if (acc?.refresh_token_enc) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(acc.refresh_token_enc))}`, { method: "POST" });
    } catch {
      /* best effort: tokens are deleted below either way */
    }
  }
  await auth.supabase.from("canvas_google_accounts").delete().not("user_id", "is", null);
  await audit(auth.supabase, "google", "disconnect", "ok");
  return Response.json({ ok: true });
}
