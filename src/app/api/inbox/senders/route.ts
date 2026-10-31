import { scopeWorkspaces } from "@/lib/inbox/server/queries";
import { handle } from "@/lib/inbox/server/workspace";

/** Sender Control Center list. ?ws=&q=&filter=vip|new|newsletters|screened|blocked */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const u = new URL(request.url);
    const wsIds = await scopeWorkspaces(ctx, u.searchParams.get("ws"));
    if (!wsIds.length) return { senders: [] };
    let q = ctx.db.from("ip_senders").select("*").in("workspace_id", wsIds);
    const text = (u.searchParams.get("q") ?? "").replace(/[^\p{L}\p{N}@._ -]/gu, "").slice(0, 80);
    if (text) q = q.or(`email.ilike.%${text}%,display_name.ilike.%${text}%`);
    const f = u.searchParams.get("filter");
    if (f === "vip") q = q.eq("is_vip", true);
    if (f === "new") q = q.eq("screening", "unknown").eq("replied_count", 0).eq("sent_to_count", 0);
    if (f === "screened") q = q.eq("screening", "screened_out");
    if (f === "blocked") q = q.eq("blocked", true);
    const { data } = await q.order("last_seen", { ascending: false, nullsFirst: false }).limit(300);
    let senders = data ?? [];
    if (f === "newsletters") {
      const { data: news } = await ctx.db.from("ip_messages").select("from_email").in("workspace_id", wsIds).eq("category", "newsletters").limit(2000);
      const set = new Set((news ?? []).map((n) => n.from_email));
      senders = senders.filter((s) => set.has(s.email));
    }
    return { senders };
  });
}
