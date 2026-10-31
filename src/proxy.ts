import { NextResponse, type NextRequest } from "next/server";
import { isPlannerHost } from "@/lib/planner-host";
import { isSatoriHost, satoriPath } from "@/lib/satori-host";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  if (isSatoriHost(host)) {
    // PromptSatori's own domain: serve its pages at clean addresses.
    return updateSession(request, satoriPath(request.nextUrl.pathname));
  }
  if (request.nextUrl.pathname === "/" && isPlannerHost(host)) {
    const url = request.nextUrl.clone();
    url.pathname = "/canvas";
    return NextResponse.redirect(url);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and PWA icons.
    "/((?!_next/static|_next/image|favicon.ico|icons/|canvas-icons/|satori-icons/|sw.js|canvas-sw.js|satori-sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
