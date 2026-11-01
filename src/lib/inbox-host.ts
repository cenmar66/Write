// Domains that are InboxSatori's own home (comma-separated; override with INBOX_HOSTS in
// Vercel). On these hosts the site IS InboxSatori: "/" opens the dashboard, short paths
// like "/mail" or "/brief" work, and Write.ai's pages are never shown.
const INBOX_HOSTS = (process.env.INBOX_HOSTS ?? "inboxsatori.com,www.inboxsatori.com")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function isInboxHost(host: string | null | undefined) {
  return !!host && INBOX_HOSTS.includes(host.split(":")[0].toLowerCase());
}

// Shared paths that work the same on every host (the app's own /inbox links included).
const PASS_THROUGH = ["/inbox", "/api/", "/login", "/auth/", "/_next/", "/inbox-icons/", "/favicon.ico", "/icon.svg"];

/**
 * For an InboxSatori host: the internal path to serve, or null to serve the path as-is.
 * "/" -> "/inbox", "/mail" -> "/inbox/mail"; anything of Write.ai's (e.g. "/docs")
 * becomes "/inbox/docs", which is an InboxSatori "not found".
 */
export function inboxPath(pathname: string): string | null {
  const shared = PASS_THROUGH.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
  if (shared) return null;
  return pathname === "/" ? "/inbox" : `/inbox${pathname}`;
}
