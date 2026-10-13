import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { linkedinAuthUrl } from "./linkedin";
import { metaAuthUrl } from "./meta";
import { threadsAuthUrl } from "./threads";

export const OAUTH_PLATFORMS = {
  linkedin: { env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"], authUrl: linkedinAuthUrl },
  meta: { env: ["META_APP_ID", "META_APP_SECRET"], authUrl: metaAuthUrl },
  threads: { env: ["THREADS_APP_ID", "THREADS_APP_SECRET"], authUrl: threadsAuthUrl },
} as const;
export type OAuthPlatform = keyof typeof OAUTH_PLATFORMS;

export const redirectUri = (origin: string, platform: OAuthPlatform) => `${origin}/api/connect/${platform}/callback`;

export function missingEnv(platform: OAuthPlatform): string | null {
  return OAUTH_PLATFORMS[platform].env.find((k) => !process.env[k]) ?? null;
}

/** A random value stored in a short-lived cookie, checked on the way back (stops forged logins). */
export async function newState(platform: OAuthPlatform) {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set(`oauth_${platform}`, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return state;
}

export async function checkState(platform: OAuthPlatform, state: string | null) {
  const jar = await cookies();
  const expected = jar.get(`oauth_${platform}`)?.value;
  jar.delete(`oauth_${platform}`);
  return !!expected && expected === state;
}
