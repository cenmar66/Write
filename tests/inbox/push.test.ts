import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePushBody, verifyPushToken } from "@/lib/inbox/push";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" };
const cfg = { audience: "https://inboxsatori.com/api/inbox/gmail/push", serviceAccount: "push@proj.iam.gserviceaccount.com" };
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const good = { iss: "https://accounts.google.com", aud: cfg.audience, email: cfg.serviceAccount, email_verified: true, iat: now, exp: now + 3600 };

function token(claims: object, key = privateKey, kid = "k1") {
  const head = b64({ alg: "RS256", kid, typ: "JWT" });
  const body = b64(claims);
  return `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url")}`;
}

describe("Gmail push notifications", () => {
  it("accepts a token signed by Google for our endpoint and sender", async () => {
    await expect(verifyPushToken(token(good), cfg, { keys: [jwk] })).resolves.toMatchObject({ email: cfg.serviceAccount });
  });

  it("rejects forged, misdirected, wrong-sender and expired tokens", async () => {
    await expect(verifyPushToken(token(good, other.privateKey), cfg, { keys: [jwk] })).rejects.toThrow(/signature/);
    await expect(verifyPushToken(token(good, privateKey, "nope"), cfg, { keys: [jwk] })).rejects.toThrow(/Unknown signing key/);
    await expect(verifyPushToken(token({ ...good, aud: "https://evil.test/push" }), cfg, { keys: [jwk] })).rejects.toThrow(/audience/);
    await expect(verifyPushToken(token({ ...good, email: "someone@evil.test" }), cfg, { keys: [jwk] })).rejects.toThrow(/sender/);
    await expect(verifyPushToken(token({ ...good, email_verified: false }), cfg, { keys: [jwk] })).rejects.toThrow(/sender/);
    await expect(verifyPushToken(token({ ...good, iss: "https://evil.test" }), cfg, { keys: [jwk] })).rejects.toThrow(/Google/);
    await expect(verifyPushToken(token({ ...good, exp: now - 3600 }), cfg, { keys: [jwk] })).rejects.toThrow(/expired/);
    await expect(verifyPushToken("not.a-token", cfg, { keys: [jwk] })).rejects.toThrow();
    const none = `${b64({ alg: "none", kid: "k1" })}.${b64(good)}.`;
    await expect(verifyPushToken(none, cfg, { keys: [jwk] })).rejects.toThrow(/algorithm/);
  });

  it("reads only the email address and history number from a notification", () => {
    const data = Buffer.from(JSON.stringify({ emailAddress: "Me@Gmail.com", historyId: 12345 })).toString("base64");
    expect(parsePushBody({ message: { data, messageId: "1" }, subscription: "s" })).toEqual({ emailAddress: "me@gmail.com", historyId: "12345" });
    expect(parsePushBody({ message: { data: "!!notjson" } })).toBeNull();
    expect(parsePushBody(null)).toBeNull();
  });
});
