import { fullText } from "@/lib/social/platforms";
import { type Account, readJson } from "./accounts";
import { IG_GRAPH } from "./instagram";
import type { PostRow, PublishResult } from "./types";

// Facebook Pages and Instagram (Business/Creator linked to a Page), via one Facebook login.

const VERSION = process.env.META_GRAPH_VERSION ?? "v26.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export function metaAuthUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: redirectUri,
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${p}`;
}

/** Code → short-lived user token → long-lived user token (page tokens made from it don't expire). */
export async function metaExchange(code: string, redirectUri: string): Promise<string> {
  const appId = process.env.META_APP_ID ?? "";
  const secret = process.env.META_APP_SECRET ?? "";
  const short = await readJson<{ access_token: string }>(
    await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: redirectUri, code })}`),
    "Facebook",
  );
  const long = await readJson<{ access_token: string }>(
    await fetch(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: short.access_token })}`,
    ),
    "Facebook",
  );
  return long.access_token;
}

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
};

export async function metaPages(userToken: string): Promise<MetaPage[]> {
  const fields = "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}";
  const res = await readJson<{ data: MetaPage[] }>(
    await fetch(`${GRAPH}/me/accounts?${new URLSearchParams({ fields, access_token: userToken, limit: "100" })}`),
    "Facebook",
  );
  return res.data ?? [];
}

const post = (path: string, params: Record<string, string>) =>
  fetch(`${GRAPH}/${path}`, { method: "POST", body: new URLSearchParams(params) });

export async function publishFacebook(account: Account, row: PostRow): Promise<PublishResult> {
  const token = account.token!;
  const pageId = account.accountId;
  const message = fullText("facebook", row.content || row.parts.join("\n\n"), row.hashtags);
  const image = row.media.find((m) => m.type === "image");
  const res = image
    ? await post(`${pageId}/photos`, { url: image.url, message, access_token: token })
    : await post(`${pageId}/feed`, { message, access_token: token });
  const body = await readJson<{ id: string; post_id?: string }>(res, "Facebook");
  return { url: `https://www.facebook.com/${body.post_id ?? body.id}` };
}

async function waitForContainer(id: string, token: string, maxSeconds: number, graph = GRAPH) {
  const until = Date.now() + maxSeconds * 1000;
  for (;;) {
    const s = await readJson<{ status_code?: string; status?: string }>(
      await fetch(`${graph}/${id}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`),
      "Instagram",
    );
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram couldn't process the media: ${s.status ?? s.status_code}`);
    if (Date.now() > until) throw new Error("Instagram is still processing the video. Try again in a few minutes.");
    await new Promise((r) => setTimeout(r, 4000));
  }
}

export async function publishInstagram(account: Account, row: PostRow): Promise<PublishResult> {
  const token = account.token!;
  const ig = account.accountId;
  // Connected with Instagram Login (no Facebook Page) → graph.instagram.com; otherwise via the Page.
  const graph = account.meta.login === "instagram" ? IG_GRAPH : GRAPH;
  const post = (path: string, params: Record<string, string>) => fetch(`${graph}/${path}`, { method: "POST", body: new URLSearchParams(params) });
  const wait = (id: string, seconds: number) => waitForContainer(id, token, seconds, graph);
  const caption = fullText("instagram", row.content || "", row.hashtags);
  const video = row.media.find((m) => m.type === "video");
  const images = row.media.filter((m) => m.type === "image").slice(0, 10);
  if (!video && images.length === 0) throw new Error("Instagram needs at least one image or video.");

  let creationId: string;
  if (video) {
    const c = await readJson<{ id: string }>(
      await post(`${ig}/media`, { media_type: "REELS", video_url: video.url, caption, share_to_feed: "true", access_token: token }),
      "Instagram",
    );
    await wait(c.id, 240);
    creationId = c.id;
  } else if (images.length === 1) {
    const c = await readJson<{ id: string }>(await post(`${ig}/media`, { image_url: images[0].url, caption, access_token: token }), "Instagram");
    await wait(c.id, 60);
    creationId = c.id;
  } else {
    const children: string[] = [];
    for (const img of images) {
      const c = await readJson<{ id: string }>(
        await post(`${ig}/media`, { image_url: img.url, is_carousel_item: "true", access_token: token }),
        "Instagram",
      );
      children.push(c.id);
    }
    for (const id of children) await wait(id, 60);
    const c = await readJson<{ id: string }>(
      await post(`${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, access_token: token }),
      "Instagram",
    );
    await wait(c.id, 60);
    creationId = c.id;
  }

  const published = await readJson<{ id: string }>(await post(`${ig}/media_publish`, { creation_id: creationId, access_token: token }), "Instagram");
  const link = await readJson<{ permalink?: string }>(
    await fetch(`${graph}/${published.id}?${new URLSearchParams({ fields: "permalink", access_token: token })}`),
    "Instagram",
  ).catch(() => ({ permalink: undefined }));
  return { url: link.permalink ?? null };
}
