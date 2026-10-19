import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Google login and magic links both land here with a one-time code (or an error from Supabase).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const toLogin = (reason: string, detail?: string) =>
    NextResponse.redirect(`${origin}/login?error=${reason}${detail ? `&detail=${encodeURIComponent(detail.slice(0, 300))}` : ""}`);

  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) return toLogin("auth_failed", providerError);

  const code = searchParams.get("code");
  if (!code) return toLogin("auth_failed", "No sign-in code was returned.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Sign-in code exchange failed", error.message);
    return toLogin("auth_failed", error.message);
  }
  if (isAllowed(data.user?.email)) return NextResponse.redirect(`${origin}/`);
  await supabase.auth.signOut();
  return toLogin("not_allowed", process.env.ALLOWED_EMAIL ? `Signed in as ${data.user?.email ?? "unknown"}.` : "ALLOWED_EMAIL isn't set in Vercel.");
}
