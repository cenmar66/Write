import { aiRewrite, REWRITE_ACTIONS } from "@/lib/inbox/ai/features";
import { isValidEmail } from "@/lib/inbox/mail/parse";
import { audit, body, handle, HttpError, loadPrefs, rateLimit, requireWorkspace } from "@/lib/inbox/server/workspace";
import type { Address } from "@/lib/inbox/types";

type Ctx = { params: Promise<{ id: string }> };

async function loadDraft(ctx: Parameters<Parameters<typeof handle>[0]>[0], id: string) {
  const { data } = await ctx.db.from("ip_drafts").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Draft not found.");
  await requireWorkspace(ctx, data.workspace_id);
  return data;
}

const cleanList = (v: unknown): Address[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, 50)
    .map((a) => (typeof a === "string" ? { email: a, name: "" } : { email: String((a as Address).email ?? ""), name: String((a as Address).name ?? "").slice(0, 120) }))
    .map((a) => ({ ...a, email: a.email.trim().toLowerCase() }))
    .filter((a) => a.email);

/** Edit fields, or apply an AI rewrite (shorten, friendlier, translate…). */
export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const d = await loadDraft(ctx, (await params).id);
    if (d.status !== "draft") throw new HttpError(409, "This draft was already sent or discarded.");
    const b = await body<{ to?: unknown; cc?: unknown; bcc?: unknown; subject?: string; body?: string; rewrite?: keyof typeof REWRITE_ACTIONS }>(request);
    const patch: Record<string, unknown> = {};
    for (const [k, col] of [["to", "to_addrs"], ["cc", "cc_addrs"], ["bcc", "bcc_addrs"]] as const) {
      if (b[k] !== undefined) {
        const list = cleanList(b[k]);
        const bad = list.find((a) => !isValidEmail(a.email));
        if (bad) throw new HttpError(400, `“${bad.email}” isn't a valid email address.`);
        patch[col] = list;
      }
    }
    if (b.subject !== undefined) patch.subject = String(b.subject).replace(/[\r\n]+/g, " ").slice(0, 300);
    if (b.body !== undefined) patch.body = String(b.body).slice(0, 50_000);
    let notes = "";
    if (b.rewrite) {
      rateLimit(`ai:${ctx.userId}`, 30);
      if (!(b.rewrite in REWRITE_ACTIONS)) throw new HttpError(400, "Unknown rewrite.");
      const prefs = await loadPrefs(ctx);
      const res = await aiRewrite({ db: ctx.db, userId: ctx.userId, workspaceId: d.workspace_id, prefs }, { action: b.rewrite, draft: String(patch.body ?? d.body), profile: prefs.writing_profile, language: d.language });
      if (!res.ok) return Response.json({ error: res.reason }, { status: 409 });
      patch.body = res.data.body;
      notes = res.data.notes;
      if (b.rewrite === "translate_es") patch.language = "es";
      if (b.rewrite === "translate_en") patch.language = "en";
    }
    const { data } = await ctx.db.from("ip_drafts").update(patch).eq("id", d.id).select().single();
    return { draft: data, notes };
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const d = await loadDraft(ctx, (await params).id);
    await ctx.db.from("ip_drafts").update({ status: "discarded" }).eq("id", d.id);
    await audit(ctx.db, d.workspace_id, "user", "draft.discard", d.id);
    return { ok: true };
  });
}
