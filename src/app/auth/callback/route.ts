import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Google login and magic links both land here with a one-time code.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (isAllowed(data.user?.email)) return NextResponse.redirect(`${origin}/`);
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_allowed`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
