import { requireOwner } from "@/lib/ai/server";
import { OAUTH_PLATFORMS, redirectUri } from "@/lib/publish/oauth";

/** Which publishing keys are set in Vercel (yes/no only, never the values), plus the exact redirect URLs. */
export async function GET(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const origin = new URL(request.url).origin;
  const has = (k: string) => !!process.env[k]?.trim();
  const encryption = (process.env.ENCRYPTION_KEY ?? "").length >= 16;
  return Response.json({
    shared: { ENCRYPTION_KEY: encryption, SUPABASE_SECRET_KEY: has("SUPABASE_SECRET_KEY"), CRON_SECRET: has("CRON_SECRET") },
    platforms: Object.fromEntries(
      Object.entries(OAUTH_PLATFORMS).map(([p, cfg]) => [
        p,
        { keys: Object.fromEntries(cfg.env.map((k) => [k, has(k)])), redirect: redirectUri(origin, p as keyof typeof OAUTH_PLATFORMS) },
      ]),
    ),
  });
}
