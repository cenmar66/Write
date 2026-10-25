import { readJson } from "./accounts";

// Instagram Business/Creator accounts connected directly with Instagram Login (no Facebook Page).
// Publishing uses the same media containers as before, on graph.instagram.com.

const VERSION = process.env.META_GRAPH_VERSION ?? "v26.0";
export const IG_GRAPH = `https://graph.instagram.com/${VERSION}`;

export function instagramAuthUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish",
    state,
    enable_fb_login: "0",
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

/** Code → short-lived token → long-lived (60-day) token, plus the profile. */
export async function instagramExchange(code: string, redirectUri: string) {
  const secret = process.env.INSTAGRAM_APP_SECRET ?? "";
  const short = await readJson<{ access_token: string; user_id: string | number }>(
    await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID ?? "",
        client_secret: secret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: code.replace(/#_$/, ""),
      }),
    }),
    "Instagram",
  );
  const long = await readJson<{ access_token: string; expires_in: number }>(
    await fetch(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: secret, access_token: short.access_token })}`),
    "Instagram",
  );
  const me = await readJson<{ user_id?: string; id?: string; username: string; profile_picture_url?: string; account_type?: string }>(
    await fetch(`${IG_GRAPH}/me?${new URLSearchParams({ fields: "user_id,username,profile_picture_url,account_type", access_token: long.access_token })}`),
    "Instagram",
  );
  return { token: long.access_token, expiresIn: long.expires_in, me, id: String(me.user_id ?? me.id ?? short.user_id) };
}

/** Long-lived Instagram tokens last 60 days and can be renewed while still valid. */
export async function instagramRefresh(token: string) {
  return readJson<{ access_token: string; expires_in: number }>(
    await fetch(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`),
    "Instagram",
  );
}
