// Gmail adapter (official Gmail REST API, OAuth 2.0). Server-only.
// Least privilege, added incrementally:
//   read   → gmail.readonly  (sync, read, search)          [restricted scope]
//   modify → gmail.modify    (labels, archive, read state) [restricted scope] — never used to delete
//   send   → gmail.send      (send after explicit confirmation) [sensitive scope]
// Tokens are AES-256-GCM encrypted, stored in ip_provider_tokens (service role only),
// refreshed here, and revoked with Google on disconnect.

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { decrypt, encrypt } from "@/lib/crypto";
import type { AccountRow } from "../types";
import type { Db } from "../db";
import { normalizeGmail, type GmailMessage } from "./parse";
import { ProviderError, type Changes, type MailProvider, type ProviderDeps } from "./provider";

export const GMAIL_SCOPES = {
  base: ["openid", "email"],
  read: ["https://www.googleapis.com/auth/gmail.readonly"],
  modify: ["https://www.googleapis.com/auth/gmail.modify"],
  send: ["https://www.googleapis.com/auth/gmail.send"],
};
export type ScopeLevel = keyof Omit<typeof GMAIL_SCOPES, "base">;

export function gmailConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export const gmailRedirectUri = (origin: string) => `${origin}/api/inbox/gmail/callback`;

/** OAuth state: random, single-use, bound to the browser by an HttpOnly cookie, carries the intent. */
export async function newOAuthState(intent: { workspaceId: string; level: ScopeLevel; accountId?: string }) {
  const nonce = randomBytes(16).toString("hex");
  const value = encrypt(JSON.stringify({ nonce, ...intent, at: Date.now() }));
  (await cookies()).set("ip_gmail_oauth", value, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/inbox/gmail" });
  return nonce;
}

export async function consumeOAuthState(nonce: string | null): Promise<{ workspaceId: string; level: ScopeLevel; accountId?: string } | null> {
  const jar = await cookies();
  const sealed = jar.get("ip_gmail_oauth")?.value;
  jar.delete("ip_gmail_oauth");
  if (!sealed || !nonce) return null;
  try {
    const data = JSON.parse(decrypt(sealed)) as { nonce: string; workspaceId: string; level: ScopeLevel; accountId?: string; at: number };
    if (data.nonce !== nonce || Date.now() - data.at > 600_000) return null;
    if (!["read", "modify", "send"].includes(data.level)) return null;
    return { workspaceId: data.workspaceId, level: data.level, accountId: data.accountId };
  } catch {
    return null;
  }
}

export function gmailAuthUrl(origin: string, level: ScopeLevel, state: string, loginHint?: string | null) {
  const scopes = [...GMAIL_SCOPES.base, ...GMAIL_SCOPES.read, ...(level === "modify" ? GMAIL_SCOPES.modify : []), ...(level === "send" ? GMAIL_SCOPES.send : [])];
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: gmailRedirectUri(origin),
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    cache: "no-store",
  });
  const json = (await r.json()) as TokenResponse;
  if (!r.ok) throw new ProviderError(json.error_description ?? `Google sign-in failed (${r.status}).`, json.error === "invalid_grant" ? "auth" : "unavailable");
  return json;
}

export const exchangeGmailCode = (code: string, origin: string) => tokenRequest({ code, grant_type: "authorization_code", redirect_uri: gmailRedirectUri(origin) });

/** Email from the OpenID id_token (verified by Google's token endpoint over TLS). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string; email_verified?: boolean; aud?: string };
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) return null;
    if (payload.email_verified === false) return null;
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function saveGmailTokens(admin: Db, accountId: string, t: TokenResponse) {
  const { data: prev } = await admin.from("ip_provider_tokens").select("*").eq("account_id", accountId).maybeSingle();
  const granted = new Set([...String(prev?.scopes ?? "").split(" "), ...t.scope.split(" ")].filter(Boolean));
  const row = {
    account_id: accountId,
    access_token_enc: encrypt(t.access_token),
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    refresh_token_enc: t.refresh_token ? encrypt(t.refresh_token) : (prev?.refresh_token_enc ?? null),
    scopes: [...granted].join(" "),
  };
  const { error } = await admin.from("ip_provider_tokens").upsert(row, { onConflict: "account_id" });
  if (error) throw new Error(error.message);
  return row.scopes;
}

export function capabilitiesFromScopes(scopes: string) {
  const has = (s: string) => scopes.split(" ").includes(s);
  const modify = has(GMAIL_SCOPES.modify[0]);
  return { read: modify || has(GMAIL_SCOPES.read[0]), search: modify || has(GMAIL_SCOPES.read[0]), modify, send: has(GMAIL_SCOPES.send[0]) };
}

async function markReconnect(admin: Db, accountId: string, message: string) {
  await admin.from("ip_provider_tokens").update({ access_token_enc: null, refresh_token_enc: null }).eq("account_id", accountId);
  await admin.from("ip_accounts").update({ status: "needs_reconnect", last_error: message }).eq("id", accountId);
}

async function accessToken(admin: Db, accountId: string, force = false): Promise<string> {
  const { data: tok } = await admin.from("ip_provider_tokens").select("*").eq("account_id", accountId).maybeSingle();
  if (!tok) throw new ProviderError("This account isn't connected. Reconnect it in Connected Accounts.", "auth");
  if (!force && tok.access_token_enc && tok.expires_at && new Date(tok.expires_at) > new Date()) return decrypt(tok.access_token_enc);
  if (!tok.refresh_token_enc) {
    await markReconnect(admin, accountId, "Google access expired. Reconnect this account.");
    throw new ProviderError("Google access expired. Reconnect this account.", "auth");
  }
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(tok.refresh_token_enc) });
    await admin.from("ip_provider_tokens").update({ access_token_enc: encrypt(t.access_token), expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString() }).eq("account_id", accountId);
    return t.access_token;
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "auth") {
      await markReconnect(admin, accountId, "Google access was revoked or expired. Reconnect this account.");
      throw new ProviderError("Google access was revoked or expired. Reconnect this account.", "auth");
    }
    throw e;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gmail API call with token refresh on 401 and backoff on 429/5xx (max 4 tries). */
async function gapi<T>(admin: Db, accountId: string, path: string, init: RequestInit = {}): Promise<T> {
  let token = await accessToken(admin, accountId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (r.status === 401 && attempt === 0) {
      token = await accessToken(admin, accountId, true);
      continue;
    }
    if (r.status === 429 || r.status >= 500 || (r.status === 403 && /rateLimit|userRateLimit/i.test(await r.clone().text()))) {
      const ra = Number(r.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** attempt + Math.random() * 250;
      if (attempt === 3) throw new ProviderError("Gmail is rate-limiting requests. InboxPilot will retry later.", "rate_limit", wait);
      await sleep(Math.min(wait, 8000));
      continue;
    }
    const text = await r.text();
    const data = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string } };
    if (r.status === 404) throw new ProviderError("Not found in Gmail.", "not_found");
    if (r.status === 403) throw new ProviderError(data.error?.message ?? "Gmail refused this request (missing permission).", "permission");
    if (!r.ok) throw new ProviderError(data.error?.message ?? `Gmail error ${r.status}`, "unavailable");
    return data;
  }
  throw new ProviderError("Gmail request failed.", "unavailable");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const META_HEADERS = ["From", "To", "Cc", "Subject", "Date", "Message-ID", "In-Reply-To", "References", "Reply-To", "List-Id", "List-Unsubscribe", "Auto-Submitted", "Precedence", "X-Autoreply", "Content-Type", "Authentication-Results"];

export function gmailProvider(deps: ProviderDeps): MailProvider {
  const admin = () => {
    if (!deps.admin) throw new ProviderError("Server isn't configured for mailbox access (SUPABASE_SECRET_KEY missing).", "unavailable");
    return deps.admin;
  };
  return {
    id: "gmail",
    capabilities: (acc) => capabilitiesFromScopes(acc.scopes),
    async listPage(acc, { pageToken, maxResults, newerThanDays }) {
      const q = new URLSearchParams({ maxResults: String(Math.min(maxResults, 500)), q: `newer_than:${newerThanDays}d -in:chats` });
      if (pageToken) q.set("pageToken", pageToken);
      const [list, profile] = await Promise.all([
        gapi<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(admin(), acc.id, `messages?${q}`),
        pageToken ? Promise.resolve(null) : gapi<{ historyId: string }>(admin(), acc.id, "profile"),
      ]);
      return { ids: list.messages ?? [], nextPageToken: list.nextPageToken ?? null, cursor: profile?.historyId ?? null, estimate: list.resultSizeEstimate };
    },
    async listChanges(acc, cursor): Promise<Changes> {
      const added = new Set<string>();
      const changed = new Set<string>();
      const removed = new Set<string>();
      let pageToken: string | undefined;
      let latest = cursor;
      try {
        for (let page = 0; page < 20; page++) {
          const q = new URLSearchParams({ startHistoryId: cursor, maxResults: "500" });
          for (const t of ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]) q.append("historyTypes", t);
          if (pageToken) q.set("pageToken", pageToken);
          const h = await gapi<{ history?: { messagesAdded?: { message: { id: string } }[]; messagesDeleted?: { message: { id: string } }[]; labelsAdded?: { message: { id: string } }[]; labelsRemoved?: { message: { id: string } }[] }[]; historyId?: string; nextPageToken?: string }>(admin(), acc.id, `history?${q}`);
          for (const e of h.history ?? []) {
            e.messagesAdded?.forEach((x) => added.add(x.message.id));
            e.messagesDeleted?.forEach((x) => removed.add(x.message.id));
            e.labelsAdded?.forEach((x) => changed.add(x.message.id));
            e.labelsRemoved?.forEach((x) => changed.add(x.message.id));
          }
          if (h.historyId) latest = h.historyId;
          pageToken = h.nextPageToken;
          if (!pageToken) break;
        }
      } catch (e) {
        // Gmail keeps history for a limited time; an old cursor returns 404 → full resync.
        if (e instanceof ProviderError && e.kind === "not_found") return { expired: true };
        throw e;
      }
      for (const id of removed) {
        added.delete(id);
        changed.delete(id);
      }
      for (const id of added) changed.delete(id);
      return { added: [...added], changed: [...changed], removed: [...removed], cursor: latest };
    },
    async getMessages(acc, ids, { format }) {
      const results = await mapLimit(ids, 5, async (id) => {
        const q = new URLSearchParams({ format });
        if (format === "metadata") META_HEADERS.forEach((h) => q.append("metadataHeaders", h));
        try {
          return normalizeGmail(await gapi<GmailMessage>(admin(), acc.id, `messages/${id}?${q}`), acc.email);
        } catch (e) {
          if (e instanceof ProviderError && e.kind === "not_found") return null;
          throw e;
        }
      });
      return results.filter((m): m is NonNullable<typeof m> => !!m);
    },
    async search(acc, query, max) {
      const q = new URLSearchParams({ q: query.slice(0, 500), maxResults: String(Math.min(max, 100)) });
      const r = await gapi<{ messages?: { id: string }[] }>(admin(), acc.id, `messages?${q}`);
      return (r.messages ?? []).map((m) => m.id);
    },
    async modify(acc, id, change) {
      if (!capabilitiesFromScopes(acc.scopes).modify) throw new ProviderError("InboxPilot doesn't have permission to organize this mailbox.", "permission");
      if ([...(change.add ?? []), ...(change.remove ?? [])].some((l) => l === "TRASH" || l === "SPAM")) throw new ProviderError("InboxPilot never trashes or spams messages.", "permission");
      await gapi(admin(), acc.id, `messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: change.add ?? [], removeLabelIds: change.remove ?? [] }) });
    },
    async ensureLabel(acc, name) {
      const clean = `InboxPilot/${name.replace(/[^\w &-]/g, "").slice(0, 40)}`;
      const list = await gapi<{ labels?: { id: string; name: string }[] }>(admin(), acc.id, "labels");
      const hit = list.labels?.find((l) => l.name === clean);
      if (hit) return hit.id;
      const created = await gapi<{ id: string }>(admin(), acc.id, "labels", { method: "POST", body: JSON.stringify({ name: clean, labelListVisibility: "labelShow", messageListVisibility: "show" }) });
      return created.id;
    },
    async send(acc, raw, threadId) {
      if (!capabilitiesFromScopes(acc.scopes).send) throw new ProviderError("Sending isn't enabled for this account. Grant send permission first.", "permission");
      return gapi<{ id: string; threadId: string }>(admin(), acc.id, "messages/send", { method: "POST", body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
    },
    async revoke(acc) {
      const { data: tok } = await admin().from("ip_provider_tokens").select("refresh_token_enc,access_token_enc").eq("account_id", acc.id).maybeSingle();
      const t = tok?.refresh_token_enc ?? tok?.access_token_enc;
      if (t) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(t))}`, { method: "POST" }).catch(() => undefined);
    },
    webLink(acc: AccountRow, m) {
      const base = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(acc.email)}`;
      return m.rfc_message_id ? `${base}#search/rfc822msgid:${encodeURIComponent(m.rfc_message_id.replace(/[<>]/g, ""))}` : `${base}#all/${m.provider_thread_id}`;
    },
  };
}
