import { estimateMonthlyCost } from "@/lib/inbox/ai/models";
import { handle, myWorkspaces } from "@/lib/inbox/server/workspace";

/** Internal operations dashboard: AI usage and cost, job queue health, sync health. */
export async function GET() {
  return handle(async (ctx) => {
    const ws = await myWorkspaces(ctx);
    const ids = ws.map((w) => w.id);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: usage }, { data: jobs }, { data: accounts }] = await Promise.all([
      ctx.db.from("ip_ai_usage").select("feature,provider,model,input_tokens,output_tokens,cost_usd,cached,ok,created_at").eq("user_id", ctx.userId).gte("created_at", since).limit(50_000),
      ids.length ? ctx.db.from("ip_jobs").select("kind,status,attempts,last_error,updated_at").in("workspace_id", ids).order("updated_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
      ids.length ? ctx.db.from("ip_accounts").select("id,email,provider,status,last_sync_at,last_error,sync_state").in("workspace_id", ids) : Promise.resolve({ data: [] }),
    ]);
    const byFeature: Record<string, { requests: number; cached: number; failed: number; input: number; output: number; cost: number }> = {};
    for (const u of usage ?? []) {
      const k = `${u.feature} · ${u.model}`;
      const r = (byFeature[k] ??= { requests: 0, cached: 0, failed: 0, input: 0, output: 0, cost: 0 });
      r.requests++;
      if (u.cached) r.cached++;
      if (!u.ok) r.failed++;
      r.input += u.input_tokens;
      r.output += u.output_tokens;
      r.cost += Number(u.cost_usd);
    }
    const jobStats: Record<string, number> = {};
    for (const j of jobs ?? []) jobStats[`${j.kind}:${j.status}`] = (jobStats[`${j.kind}:${j.status}`] ?? 0) + 1;
    return {
      ai: { last30Days: byFeature, totalCost: Object.values(byFeature).reduce((a, r) => a + r.cost, 0) },
      jobs: { counts: jobStats, recentFailures: (jobs ?? []).filter((j) => j.status === "dead" || (j.status === "queued" && j.last_error)).slice(0, 20) },
      accounts: accounts ?? [],
      estimate: estimateMonthlyCost(),
      cronConfigured: !!process.env.CRON_SECRET,
    };
  });
}
