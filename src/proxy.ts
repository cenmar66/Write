import { NextResponse, type NextRequest } from "next/server";
import { isPlannerHost } from "@/lib/planner-host";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/" && isPlannerHost(request.headers.get("host"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/canvas";
    return NextResponse.redirect(url);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and PWA icons.
    "/((?!_next/static|_next/image|favicon.ico|icons/|canvas-icons/|sw.js|canvas-sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
