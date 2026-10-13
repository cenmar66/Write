import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

// /api/cron checks its own secret (Vercel calls it with no one signed in).
const PUBLIC_PATHS = ["/login", "/auth", "/manifest.webmanifest", "/api/cron/"];

/** Refreshes the session cookie and keeps everyone but the owner out. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  const redirectTo = (pathname: string, error?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = error ? `?error=${error}` : "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (data?.claims && !isAllowed(email)) {
    await supabase.auth.signOut();
    return isPublic ? response : redirectTo("/login", "not_allowed");
  }
  if (!data?.claims && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return redirectTo("/login");
  }
  if (data?.claims && path === "/login") return redirectTo("/");

  return response;
}
