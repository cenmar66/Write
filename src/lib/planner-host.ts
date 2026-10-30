// Domains whose home page is The Daily Canvas instead of Write.ai (comma-separated,
// override with PLANNER_HOSTS in Vercel). Every other path works as usual on them.
const PLANNER_HOSTS = (process.env.PLANNER_HOSTS ?? "cenmar.org,www.cenmar.org")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function isPlannerHost(host: string | null | undefined) {
  return !!host && PLANNER_HOSTS.includes(host.split(":")[0].toLowerCase());
}
