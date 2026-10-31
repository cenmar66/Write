// Domains that are PromptSatori's own home (comma-separated; override with SATORI_HOSTS
// in Vercel). On these hosts the site IS PromptSatori: "/" shows the generator, short
// paths like "/library" work, and Write.ai's pages are never shown.
const SATORI_HOSTS = (process.env.SATORI_HOSTS ?? "promptsatori.com,www.promptsatori.com")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function isSatoriHost(host: string | null | undefined) {
  return !!host && SATORI_HOSTS.includes(host.split(":")[0].toLowerCase());
}

// Shared paths that work the same on every host.
const PASS_THROUGH = ["/satori", "/api/", "/login", "/auth/", "/_next/", "/satori-icons/", "/satori-sw.js", "/favicon.ico", "/icon.svg"];

/**
 * For a PromptSatori host: the internal path to serve, or null to serve the path as-is.
 * "/" -> "/satori", "/library" -> "/satori/library"; anything else of Write.ai's
 * (e.g. "/docs") becomes "/satori/docs", which is a PromptSatori "not found".
 */
export function satoriPath(pathname: string): string | null {
  const shared = PASS_THROUGH.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
  if (shared) return null;
  return pathname === "/" ? "/satori" : `/satori${pathname}`;
}
