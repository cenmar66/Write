// Gmail adapter: OAuth state, token refresh, revocation, rate limits, history expiry.
// Google is replaced by a mocked fetch; nothing leaves the machine.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => jar.set(k, v),
    delete: (k: string) => jar.delete(k),
  }),
}));

import { decrypt, encrypt } from "@/lib/crypto";
import type { Db } from "@/lib/inbox/db";
import { capabilitiesFromScopes, consumeOAuthState, emailFromIdToken, gmailAuthUrl, gmailProvider, newOAuthState, saveGmailTokens } from "@/lib/inbox/mail/gmail";
import { MemoryDb } from "@/lib/inbox/memory-db";
import type { AccountRow } from "@/lib/inbox/types";

process.env.GOOGLE_CLIENT_ID = "client-123";
process.env.GOOGLE_CLIENT_SECRET = "secret";

let mem: MemoryDb;
let db: Db;
let acc: AccountRow;
const calls: string[] = [];
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

beforeEach(async () => {
  jar.clear();
  calls.length = 0;
  mem = new MemoryDb({ id: "u1", email: "o@x.test" });
  db = mem as unknown as Db;
  const { data: ws } = await db.from("ip_workspaces").insert({ name: "W" }).select().single();
  const { data } = await db.from("ip_accounts").insert({ workspace_id: ws!.id, provider: "gmail", email: "me@gmail.test", scopes: "https://www.googleapis.com/auth/gmail.readonly" }).select().single();
  acc = data as AccountRow;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return handler(url, init);
  });
});
afterEach(() => vi.unstubAllGlobals());

const token = (row: Record<string, unknown>) => mem.rows("ip_provider_tokens").push({ account_id: acc.id, scopes: "", ...row });

describe("OAuth flow", () => {
  it("asks only for the scopes the step needs", () => {
    const read = new URL(gmailAuthUrl("https://app.test", "read", "s"));
    expect(read.searchParams.get("scope")).toContain("gmail.readonly");
    expect(read.searchParams.get("scope")).not.toContain("gmail.modify");
    expect(read.searchParams.get("scope")).not.toContain("gmail.send");
    expect(read.searchParams.get("redirect_uri")).toBe("https://app.test/api/inbox/gmail/callback");
    expect(new URL(gmailAuthUrl("https://app.test", "send", "s")).searchParams.get("scope")).toContain("gmail.send");
  });

  it("accepts the state once, only from the same browser, and rejects forgeries", async () => {
    const nonce = await newOAuthState({ workspaceId: "w1", level: "read" });
    expect(await consumeOAuthState("forged")).toBeNull();
    const again = await newOAuthState({ workspaceId: "w1", level: "read" });
    expect(await consumeOAuthState(again)).toEqual({ workspaceId: "w1", level: "read", accountId: undefined });
    expect(await consumeOAuthState(again)).toBeNull(); // single use
    expect(nonce).not.toBe(again);
  });

  it("trusts the id_token email only for our client id", () => {
    const mk = (p: object) => `x.${Buffer.from(JSON.stringify(p)).toString("base64url")}.y`;
    expect(emailFromIdToken(mk({ aud: "client-123", email: "Me@Gmail.test", email_verified: true }))).toBe("me@gmail.test");
    expect(emailFromIdToken(mk({ aud: "someone-else", email: "me@gmail.test" }))).toBeNull();
  });

  it("stores tokens encrypted and merges incremental scopes", async () => {
    await saveGmailTokens(db, acc.id, { access_token: "AT1", refresh_token: "RT1", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.readonly" });
    await saveGmailTokens(db, acc.id, { access_token: "AT2", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.send" });
    const row = mem.rows("ip_provider_tokens")[0] as Record<string, string>;
    expect(row.access_token_enc).not.toContain("AT2");
    expect(decrypt(row.access_token_enc)).toBe("AT2");
    expect(decrypt(row.refresh_token_enc)).toBe("RT1"); // kept when Google doesn't resend it
    expect(capabilitiesFromScopes(row.scopes)).toEqual({ read: true, search: true, modify: false, send: true });
  });
});

describe("token lifecycle", () => {
  it("refreshes an expired access token and retries", async () => {
    token({ access_token_enc: encrypt("old"), refresh_token_enc: encrypt("RT"), expires_at: new Date(Date.now() - 1000).toISOString() });
    handler = (url) => (url.includes("oauth2.googleapis.com/token") ? json(200, { access_token: "fresh", expires_in: 3600, scope: "" }) : json(200, { messages: [], historyId: "55" }));
    const page = await gmailProvider({ admin: db }).listPage(acc, { pageToken: null, maxResults: 10, newerThanDays: 30 });
    expect(page.cursor).toBe("55");
    expect(calls[0]).toContain("oauth2.googleapis.com/token");
    expect(decrypt((mem.rows("ip_provider_tokens")[0] as Record<string, string>).access_token_enc)).toBe("fresh");
  });

  it("marks the account for reconnect and forgets tokens when Google revokes access", async () => {
    token({ access_token_enc: null, refresh_token_enc: encrypt("RT"), expires_at: null });
    handler = () => json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    await expect(gmailProvider({ admin: db }).listPage(acc, { pageToken: null, maxResults: 10, newerThanDays: 30 })).rejects.toThrow(/Reconnect/);
    const a = mem.rows("ip_accounts")[0] as Record<string, unknown>;
    expect(a.status).toBe("needs_reconnect");
    expect((mem.rows("ip_provider_tokens")[0] as Record<string, unknown>).refresh_token_enc).toBeNull();
  });

  it("backs off on rate limits", async () => {
    token({ access_token_enc: encrypt("AT"), refresh_token_enc: encrypt("RT"), expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    let n = 0;
    handler = () => (++n === 1 ? json(429, { error: { message: "rate" } }, { "retry-after": "0" }) : json(200, { history: [], historyId: "9" }));
    const res = await gmailProvider({ admin: db }).listChanges(acc, "5");
    expect(res).toEqual({ added: [], changed: [], removed: [], cursor: "9" });
    expect(n).toBe(2);
  });

  it("reports an expired history cursor so sync can start over", async () => {
    token({ access_token_enc: encrypt("AT"), refresh_token_enc: encrypt("RT"), expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    handler = () => json(404, { error: { message: "Requested entity was not found." } });
    expect(await gmailProvider({ admin: db }).listChanges(acc, "1")).toEqual({ expired: true });
  });

  it("refuses to trash/spam and to modify without permission", async () => {
    token({ access_token_enc: encrypt("AT"), refresh_token_enc: encrypt("RT"), expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    handler = () => json(200, {});
    const p = gmailProvider({ admin: db });
    await expect(p.modify(acc, "m1", { remove: ["INBOX"] })).rejects.toThrow(/permission/);
    await expect(p.modify({ ...acc, scopes: "https://www.googleapis.com/auth/gmail.modify" }, "m1", { add: ["TRASH"] })).rejects.toThrow(/never/);
    await expect(p.send(acc, "raw", null)).rejects.toThrow(/Sending isn't enabled/);
    expect(calls).toHaveLength(0);
  });

  it("revokes with Google on disconnect", async () => {
    token({ access_token_enc: encrypt("AT"), refresh_token_enc: encrypt("RT"), expires_at: null });
    handler = () => json(200, {});
    await gmailProvider({ admin: db }).revoke(acc);
    expect(calls[0]).toContain("oauth2.googleapis.com/revoke?token=RT");
  });
});
