// Gmail push notifications (near-instant sync). Gmail tells a Google Cloud Pub/Sub topic
// that a mailbox changed; Pub/Sub then POSTs to /api/inbox/gmail/push with a Google-signed
// token. We check that token (signature, issuer, audience, sender) before doing anything.
// A notification carries only an email address and a history number: no mail content.
// All it can do is make InboxSatori sync that mailbox now instead of within 10 minutes.

import { createPublicKey, verify as verifySig, type JsonWebKey } from "node:crypto";

export interface PushConfig {
  topic: string;
  audience: string;
  serviceAccount: string;
}

/** Configured when all three are set (see docs/inbox/SETUP.md, "Instant updates"). */
export function pushConfig(): PushConfig | null {
  const topic = process.env.GMAIL_PUBSUB_TOPIC?.trim();
  const audience = process.env.GMAIL_PUSH_AUDIENCE?.trim();
  const serviceAccount = process.env.GMAIL_PUSH_SERVICE_ACCOUNT?.trim().toLowerCase();
  return topic && audience && serviceAccount ? { topic, audience, serviceAccount } : null;
}

type Jwk = JsonWebKey & { kid?: string };
let cache: { keys: Jwk[]; at: number } | null = null;

async function googleKeys(): Promise<Jwk[]> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cache: "no-store" });
  if (!r.ok) throw new Error(`Couldn't load Google's signing keys (${r.status}).`);
  const keys = ((await r.json()) as { keys: Jwk[] }).keys;
  cache = { keys, at: Date.now() };
  return keys;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/**
 * Verifies a Pub/Sub push token (an OIDC JWT signed by Google). Returns the claims, or
 * throws. `keys` can be supplied for tests.
 */
export async function verifyPushToken(token: string, cfg: Pick<PushConfig, "audience" | "serviceAccount">, opts: { keys?: Jwk[]; now?: number } = {}) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token.");
  const header = JSON.parse(b64url(parts[0]).toString("utf8")) as { alg?: string; kid?: string };
  const claims = JSON.parse(b64url(parts[1]).toString("utf8")) as { iss?: string; aud?: string; email?: string; email_verified?: boolean; exp?: number; iat?: number };
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm.");
  const keys = opts.keys ?? (await googleKeys());
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Unknown signing key.");
  const ok = verifySig("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), b64url(parts[2]));
  if (!ok) throw new Error("Bad token signature.");
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!claims.iss || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) throw new Error("Token not issued by Google.");
  if (claims.aud !== cfg.audience) throw new Error("Token is for a different audience.");
  if (!claims.exp || claims.exp < now - 60) throw new Error("Token expired.");
  if (!claims.email_verified || claims.email?.toLowerCase() !== cfg.serviceAccount) throw new Error("Token is from an unexpected sender.");
  return claims;
}

/** The Gmail notification inside a Pub/Sub push body: { emailAddress, historyId }. */
export function parsePushBody(body: unknown): { emailAddress: string; historyId: string } | null {
  const data = (body as { message?: { data?: string } } | null)?.message?.data;
  if (typeof data !== "string") return null;
  try {
    const n = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as { emailAddress?: string; historyId?: string | number };
    if (!n.emailAddress || typeof n.emailAddress !== "string") return null;
    return { emailAddress: n.emailAddress.toLowerCase().slice(0, 320), historyId: String(n.historyId ?? "") };
  } catch {
    return null;
  }
}
