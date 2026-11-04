import { blackHoleSender, canArchiveIn } from "@/lib/inbox/server/black-hole";
import { scopeWorkspaces } from "@/lib/inbox/server/queries";
import { audit, body, handle, HttpError, isUuid } from "@/lib/inbox/server/workspace";
import type { SenderRow } from "@/lib/inbox/types";

export const maxDuration = 60;

/**
 * Bulk Black Hole, from the user's own selection in a mail list.
 * Step 1 { message_ids }: preview only, changes nothing; returns the senders of those messages.
 * Step 2 { sender_ids, confirm: true } (up to 10 per call; the app sends batches): sends each
 * sender to the Black Hole: archive (never trash), now and on arrival, undo per sender.
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ message_ids?: string[]; sender_ids?: string[]; confirm?: boolean }>(request);
    const wsIds = await scopeWorkspaces(ctx, "all");
    if (!wsIds.length) throw new HttpError(403, "Not allowed.");

    if (!b.confirm) {
      const ids = (b.message_ids ?? []).filter(isUuid).slice(0, 1000);
      if (!ids.length) throw new HttpError(400, "Select some messages.");
      const { data: msgs } = await ctx.db.from("ip_messages").select("workspace_id,from_email,is_sent").in("id", ids).in("workspace_id", wsIds);
      const pairs = new Map<string, { workspace_id: string; email: string; selected: number }>();
      for (const m of msgs ?? []) {
        if (m.is_sent || !m.from_email) continue;
        const k = `${m.workspace_id}|${m.from_email}`;
        const cur = pairs.get(k) ?? { workspace_id: m.workspace_id, email: m.from_email, selected: 0 };
        cur.selected++;
        pairs.set(k, cur);
      }
      const senders: { id: string; email: string; name: string; selected: number; blocked: boolean }[] = [];
      for (const ws of new Set([...pairs.values()].map((p) => p.workspace_id))) {
        const emails = [...pairs.values()].filter((p) => p.workspace_id === ws).map((p) => p.email);
        const { data } = await ctx.db.from("ip_senders").select("id,email,display_name,blocked,workspace_id").eq("workspace_id", ws).in("email", emails);
        for (const s of data ?? []) senders.push({ id: s.id, email: s.email, name: s.display_name ?? "", selected: pairs.get(`${ws}|${s.email}`)?.selected ?? 0, blocked: !!s.blocked });
      }
      senders.sort((a, b) => b.selected - a.selected);
      const canArchive = (await Promise.all([...new Set([...pairs.values()].map((p) => p.workspace_id))].map((w) => canArchiveIn(ctx, w)))).some(Boolean);
      return { senders: senders.slice(0, 200), canArchive };
    }

    const sids = (b.sender_ids ?? []).filter(isUuid).slice(0, 10);
    if (!sids.length) throw new HttpError(400, "No senders.");
    const { data: rows } = await ctx.db.from("ip_senders").select("id,workspace_id,email,blocked").in("id", sids);
    const senders = (rows ?? []) as Pick<SenderRow, "id" | "workspace_id" | "email" | "blocked">[];
    if (senders.some((s) => !wsIds.includes(s.workspace_id))) throw new HttpError(403, "Not allowed.");
    let affected = 0;
    let archived = 0;
    for (const s of senders) {
      const r = await blackHoleSender(ctx, s);
      affected += r.affected;
      archived += r.archived;
      await audit(ctx.db, s.workspace_id, "user", "sender.black_hole", s.email, { blocked: true, affected: r.affected, archived: r.archived, bulk: true });
    }
    return { ok: true, senders: senders.length, affected, archived };
  });
}
