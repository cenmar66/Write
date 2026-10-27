import { NextResponse } from "next/server";
import { audit, checkState, exchangeCode, getAccount, saveTokens } from "@/lib/canvas/google";
import { guard } from "../_auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(`${url.origin}/canvas/settings?${q}#integrations`);
  const g = await guard();
  if ("denied" in g) return g.denied;
  if (url.searchParams.get("error")) return back(`google_error=${encodeURIComponent(url.searchParams.get("error") ?? "cancelled")}`);
  if (!(await checkState(url.searchParams.get("state")))) return back("google_error=expired");
  const code = url.searchParams.get("code");
  if (!code) return back("google_error=no_code");
  try {
    const t = await exchangeCode(code, url.origin);
    await saveTokens(g.supabase, g.userId, t, await getAccount(g.supabase));
    await audit(g.supabase, "google", "connect", "ok", { scopes: t.scope });
    return back("google=connected");
  } catch (e) {
    await audit(g.supabase, "google", "connect", "error", { message: e instanceof Error ? e.message : String(e) });
    return back(`google_error=${encodeURIComponent(e instanceof Error ? e.message : "failed")}`);
  }
}
