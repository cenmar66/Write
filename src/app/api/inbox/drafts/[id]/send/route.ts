import { buildRawEmail } from "@/lib/inbox/mail/parse";
import { providerFor } from "@/lib/inbox/mail/provider";
import { storeMessages } from "@/lib/inbox/server/sync";
import { processNewMessages } from "@/lib/inbox/server/process";
import { audit, body, handle, HttpError, loadPrefs, rateLimit, requireWorkspace } from "@/lib/inbox/server/workspace";
import { confirmationToken, reviewOutgoing, type Outgoing } from "@/lib/inbox/send-guard";
import type { AccountRow, DraftRow, MessageRow } from "@/lib/inbox/types";

type Ctx = { params: Promise<{ id: string }> };

async function prepare(ctx: Parameters<Parameters<typeof handle>[0]>[0], id: string) {
  const { data: d } = await ctx.db.from("ip_drafts").select("*").eq("id", id).maybeSingle();
  if (!d) throw new HttpError(404, "Draft not found.");
  await requireWorkspace(ctx, d.workspace_id);
  const draft = d as DraftRow;
  const { data: acc } = await ctx.db.from("ip_accounts").select("*").eq("id", draft.account_id).single();
  const account = acc as AccountRow;
  const { data: orig } = draft.message_id ? await ctx.db.from("ip_messages").select("*").eq("id", draft.message_id).maybeSingle() : { data: null };
  const original = orig as MessageRow | null;
  const { data: thread } = original?.thread_id ? await ctx.db.from("ip_messages").select("from_email,to_addrs,cc_addrs").eq("thread_id", original.thread_id) : { data: [] };
  const participants = [...new Set((thread ?? []).flatMap((t) => [t.from_email as string, ...((t.to_addrs ?? []) as { email: string }[]).map((a) => a.email), ...((t.cc_addrs ?? []) as { email: string }[]).map((a) => a.email)]))];
  const { data: known } = await ctx.db.from("ip_senders").select("email").eq("workspace_id", draft.workspace_id).or("sent_to_count.gt.0,replied_count.gt.0");
  const out: Outgoing = { account_id: account.id, from: account.email, to: draft.to_addrs, cc: draft.cc_addrs, bcc: draft.bcc_addrs, subject: draft.subject, body: draft.body };
  const review = reviewOutgoing(out, { replyAccountId: original?.account_id ?? null, threadParticipants: participants, knownContacts: new Set((known ?? []).map((k) => k.email as string)) });
  const provider = await providerFor(account, { admin: ctx.admin });
  if (!provider.capabilities(account).send) review.errors.push(account.provider === "gmail" ? "Sending isn't enabled for this account yet. Grant send permission in Connected Accounts." : "This account can't send.");
  return { draft, account, original, out, review, provider };
}

/** The review screen: exactly what will be sent, warnings, and a one-time confirmation token. */
export async function GET(_request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    const p = await prepare(ctx, (await params).id);
    return {
      from: p.account.email,
      account_provider: p.account.provider,
      to: p.out.to,
      cc: p.out.cc,
      bcc: p.out.bcc,
      subject: p.out.subject,
      body: p.out.body,
      attachments: [],
      demo: p.account.provider === "demo",
      errors: p.review.errors,
      warnings: p.review.warnings,
      token: p.review.errors.length ? null : confirmationToken(p.out, p.draft.id),
    };
  });
}

/** Sends only with a token that matches the reviewed message. Never called by AI or rules. */
export async function POST(request: Request, { params }: Ctx) {
  return handle(async (ctx) => {
    rateLimit(`send:${ctx.userId}`, 10);
    const b = await body<{ token?: string; confirmed?: boolean }>(request);
    const p = await prepare(ctx, (await params).id);
    if (p.draft.status !== "draft") throw new HttpError(409, "This draft was already sent or discarded.");
    if (p.review.errors.length) throw new HttpError(400, p.review.errors.join(" "));
    if (b.confirmed !== true || !b.token || b.token !== confirmationToken(p.out, p.draft.id)) throw new HttpError(409, "The message changed since you reviewed it. Review it again before sending.");
    // Claim the draft first so a double-click can't send twice.
    const { data: claimed } = await ctx.db.from("ip_drafts").update({ status: "sending" }).eq("id", p.draft.id).eq("status", "draft").select("id");
    if (!claimed?.length) throw new HttpError(409, "Already sending.");
    try {
      const raw = buildRawEmail({ from: p.account.email, to: p.out.to, cc: p.out.cc, bcc: p.out.bcc, subject: p.out.subject, body: p.out.body, inReplyTo: p.original?.rfc_message_id ?? null });
      const sent = await p.provider.send(p.account, raw, p.draft.provider_thread_id);
      await ctx.db.from("ip_drafts").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: sent.id, error: null }).eq("id", p.draft.id);
      await audit(ctx.db, p.draft.workspace_id, "user", "mail.send", p.draft.id, { to: p.out.to.length, cc: p.out.cc.length, bcc: p.out.bcc.length, provider: p.account.provider });
      // Pull the sent message in so follow-up tracking sees it right away.
      const prefs = await loadPrefs(ctx);
      const msgs = await p.provider.getMessages(p.account, [sent.id], { format: "full" }).catch(() => []);
      const fresh = await storeMessages(ctx.db, p.account, msgs, prefs);
      await processNewMessages(ctx.db, ctx.admin, p.account, fresh, prefs);
      if (p.original) await ctx.db.from("ip_messages").update({ done_at: new Date().toISOString() }).eq("id", p.original.id);
      return { ok: true, demo: p.account.provider === "demo" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.db.from("ip_drafts").update({ status: "draft", error: msg.slice(0, 500) }).eq("id", p.draft.id);
      throw new HttpError(502, `Not sent: ${msg}`);
    }
  });
}
