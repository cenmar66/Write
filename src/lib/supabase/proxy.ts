import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

// /api/cron checks its own secret, and /api/v1 checks access codes (no one is signed in for either).
const PUBLIC_PATHS = ["/login", "/auth", "/manifest.webmanifest", "/canvas/manifest.webmanifest", "/inbox/manifest.webmanifest", "/api/cron/", "/api/v1"];

// Dev/test only: lets The Daily Canvas run on this device without signing in (data stays in
// the browser). Ignored in production builds, whatever the variable says.
const CANVAS_LOCAL_ONLY = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_CANVAS_LOCAL_ONLY === "1";
// Dev/test only: InboxPilot's local demo mode (in-memory data, fake owner). Never in production.
const INBOX_LOCAL_DEMO = process.env.NODE_ENV !== "production" && process.env.INBOX_LOCAL_DEMO === "1";

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
  const isPublic =
    PUBLIC_PATHS.some((p) => path.startsWith(p)) ||
    (CANVAS_LOCAL_ONLY && path.startsWith("/canvas")) ||
    (INBOX_LOCAL_DEMO && (path.startsWith("/inbox") || path.startsWith("/api/inbox")));

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
    if (path.startsWith("/canvas") || path.startsWith("/inbox")) {
      // Come back to the planner / InboxPilot after signing in.
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=/${path.startsWith("/inbox") ? "inbox" : "canvas"}`;
      return NextResponse.redirect(url);
    }
    return redirectTo("/login");
  }
  if (data?.claims && path === "/login") return redirectTo("/");

  return response;
}
