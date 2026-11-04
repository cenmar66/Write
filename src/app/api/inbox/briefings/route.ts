import { generateBriefing } from "@/lib/inbox/server/briefing";
import { scopeWorkspaces } from "@/lib/inbox/server/queries";
import { body, handle, loadPrefs, rateLimit } from "@/lib/inbox/server/workspace";

/** Latest briefing (or ?id=) plus a short history. */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const id = new URL(request.url).searchParams.get("id");
    const { data: list } = await ctx.db.from("ip_briefings").select("id,slot,created_at,summary_source").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(20);
    const pick = id ?? list?.[0]?.id;
    const { data: briefing } = pick ? await ctx.db.from("ip_briefings").select("*").eq("id", pick).eq("user_id", ctx.userId).maybeSingle() : { data: null };
    return { briefing, history: list ?? [] };
  });
}

/** "Brief me now". */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    rateLimit(`brief:${ctx.userId}`, 10);
    const b = await body<{ ws?: string; mode?: "concise" | "expanded"; ai?: boolean }>(request);
    const prefs = await loadPrefs(ctx);
    const wsIds = await scopeWorkspaces(ctx, b.ws ?? "all");
    const briefing = await generateBriefing(ctx.db, ctx.userId, wsIds, prefs, "on_demand", { mode: b.mode === "expanded" ? "expanded" : b.mode === "concise" ? "concise" : undefined, useAi: b.ai !== false });
    return { briefing };
  });
}
