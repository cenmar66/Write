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

/** Add senders by address (e.g. VIPs during onboarding, before any mail has synced). */
export async function POST(request: Request) {
  const { body, HttpError, requireWorkspace, audit } = await import("@/lib/inbox/server/workspace");
  const { isValidEmail, domainOf } = await import("@/lib/inbox/mail/parse");
  return handle(async (ctx) => {
    const b = await body<{ ws?: string; emails?: string[]; is_vip?: boolean }>(request);
    const ws = await requireWorkspace(ctx, b.ws);
    const emails = [...new Set((b.emails ?? []).map((e) => String(e).trim().toLowerCase()))].filter(isValidEmail).slice(0, 100);
    if (!emails.length) throw new HttpError(400, "Add at least one valid email address.");
    const { data: existing } = await ctx.db.from("ip_senders").select("email").eq("workspace_id", ws.id).in("email", emails);
    const known = new Set((existing ?? []).map((e) => e.email));
    const fresh = emails.filter((e) => !known.has(e));
    if (fresh.length) await ctx.db.from("ip_senders").insert(fresh.map((email) => ({ workspace_id: ws.id, email, domain: domainOf(email), is_vip: !!b.is_vip })));
    if (known.size) await ctx.db.from("ip_senders").update({ is_vip: !!b.is_vip }).eq("workspace_id", ws.id).in("email", [...known]);
    await audit(ctx.db, ws.id, "user", "sender.add", null, { count: emails.length, vip: !!b.is_vip });
    return { ok: true, added: emails.length };
  });
}
