import { type Account, readJson } from "@/lib/publish/accounts";

// Reads your own posts, their numbers, comments and follower counts from each platform's official API.
// Instagram, Facebook Pages and Threads only: X and personal LinkedIn don't share these with apps like this one.

const VERSION = process.env.META_GRAPH_VERSION ?? "v26.0";
const FB = `https://graph.facebook.com/${VERSION}`;
const IG = `https://graph.instagram.com/${VERSION}`;
const TH = "https://graph.threads.net/v1.0";

/** How many recent posts to pull per platform on each refresh. */
export const RECENT_LIMIT = 25;

export type AnalyticsPlatform = "instagram" | "facebook" | "threads";
export const ANALYTICS_PLATFORMS: AnalyticsPlatform[] = ["instagram", "facebook", "threads"];

export type Metrics = { views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null };
export type SourceItem = { externalId: string; permalink: string | null; text: string; mediaType: string | null; postedAt: string | null; metrics: Metrics };
export type SourceComment = { externalId: string; author: string; text: string; likeCount: number | null; postedAt: string | null };

export const EMPTY: Metrics = { views: null, reach: null, likes: null, comments: null, shares: null, saves: null };

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null);

/** Insights come back as { data: [{ name, values: [{ value }] }] } or with total_value; this flattens both. */
export function parseInsights(body: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of ((body as { data?: unknown[] })?.data ?? []) as { name?: string; values?: { value?: unknown }[]; total_value?: { value?: unknown } }[]) {
    if (!m?.name) continue;
    const v = num(m.total_value?.value) ?? num(m.values?.[0]?.value);
    if (v !== null) out[m.name] = v;
  }
  return out;
}

/** Runs tasks a few at a time, so a refresh doesn't fire a hundred requests at once. */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Best effort: one post's missing insight shouldn't sink the whole refresh. */
async function tryInsights(url: string, platform: string): Promise<Record<string, number>> {
  try {
    return parseInsights(await readJson(await fetch(url), platform));
  } catch {
    return {};
  }
}

export type PlatformData = { followers: number | null; items: (SourceItem & { replies: SourceComment[] })[] };

// ---------- Instagram (Instagram Login or Facebook Login) ----------

export async function fetchInstagram(account: Account): Promise<PlatformData> {
  const graph = account.meta.login === "instagram" ? IG : FB;
  const token = account.token!;
  const id = account.accountId;
  const profile = await readJson<{ followers_count?: number }>(await fetch(`${graph}/${id}?${qs({ fields: "followers_count", access_token: token })}`), "Instagram");
  const media = await readJson<{ data?: { id: string; caption?: string; media_type?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number }[] }>(
    await fetch(`${graph}/${id}/media?${qs({ fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count", limit: String(RECENT_LIMIT), access_token: token })}`),
    "Instagram",
  );
  const items = await pool(media.data ?? [], 5, async (m) => {
    let ins = await tryInsights(`${graph}/${m.id}/insights?${qs({ metric: "views,reach,saved,shares", access_token: token })}`, "Instagram");
    if (!Object.keys(ins).length) ins = await tryInsights(`${graph}/${m.id}/insights?${qs({ metric: "reach,saved", access_token: token })}`, "Instagram");
    const replies = await readJson<{ data?: { id: string; text?: string; username?: string; timestamp?: string; like_count?: number }[] }>(
      await fetch(`${graph}/${m.id}/comments?${qs({ fields: "id,text,username,timestamp,like_count", limit: "50", access_token: token })}`),
      "Instagram",
    ).catch(() => ({ data: [] }));
    return {
      externalId: m.id,
      permalink: m.permalink ?? null,
      text: m.caption ?? "",
      mediaType: m.media_type ?? null,
      postedAt: m.timestamp ?? null,
      metrics: { views: ins.views ?? null, reach: ins.reach ?? null, likes: num(m.like_count), comments: num(m.comments_count), shares: ins.shares ?? null, saves: ins.saved ?? null },
      replies: (replies.data ?? []).map((c) => ({ externalId: c.id, author: c.username ?? "", text: c.text ?? "", likeCount: num(c.like_count), postedAt: c.timestamp ?? null })),
    };
  });
  return { followers: num(profile.followers_count), items };
}

// ---------- Facebook Page ----------

type FbPost = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
};

export async function fetchFacebook(account: Account): Promise<PlatformData> {
  const token = account.token!;
  const id = account.accountId;
  const page = await readJson<{ followers_count?: number; fan_count?: number }>(await fetch(`${FB}/${id}?${qs({ fields: "followers_count,fan_count", access_token: token })}`), "Facebook");
  const posts = await readJson<{ data?: FbPost[] }>(
    await fetch(
      `${FB}/${id}/published_posts?${qs({
        fields: "id,message,created_time,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)",
        limit: String(RECENT_LIMIT),
        access_token: token,
      })}`,
    ),
    "Facebook",
  );
  const items = await pool(posts.data ?? [], 5, async (p) => {
    const ins = await tryInsights(`${FB}/${p.id}/insights?${qs({ metric: "post_impressions_unique", access_token: token })}`, "Facebook");
    const replies = await readJson<{ data?: { id: string; message?: string; from?: { name?: string }; created_time?: string; like_count?: number }[] }>(
      await fetch(`${FB}/${p.id}/comments?${qs({ fields: "id,message,from{name},created_time,like_count", limit: "50", access_token: token })}`),
      "Facebook",
    ).catch(() => ({ data: [] }));
    return {
      externalId: p.id,
      permalink: p.permalink_url ?? null,
      text: p.message ?? "",
      mediaType: null,
      postedAt: p.created_time ?? null,
      metrics: {
        views: null,
        reach: ins.post_impressions_unique ?? null,
        likes: num(p.reactions?.summary?.total_count),
        comments: num(p.comments?.summary?.total_count),
        shares: num(p.shares?.count) ?? 0,
        saves: null,
      },
      replies: (replies.data ?? []).map((c) => ({ externalId: c.id, author: c.from?.name ?? "", text: c.message ?? "", likeCount: num(c.like_count), postedAt: c.created_time ?? null })),
    };
  });
  return { followers: num(page.followers_count) ?? num(page.fan_count), items };
}

// ---------- Threads ----------

export async function fetchThreads(account: Account): Promise<PlatformData> {
  const token = account.token!;
  const followers = await tryInsights(`${TH}/me/threads_insights?${qs({ metric: "followers_count", access_token: token })}`, "Threads");
  const posts = await readJson<{ data?: { id: string; text?: string; permalink?: string; timestamp?: string; media_type?: string }[] }>(
    await fetch(`${TH}/me/threads?${qs({ fields: "id,text,permalink,timestamp,media_type", limit: String(RECENT_LIMIT), access_token: token })}`),
    "Threads",
  );
  const items = await pool((posts.data ?? []).filter((p) => p.media_type !== "REPOST_FACADE"), 5, async (p) => {
    const ins = await tryInsights(`${TH}/${p.id}/insights?${qs({ metric: "views,likes,replies,reposts,quotes,shares", access_token: token })}`, "Threads");
    const replies = await readJson<{ data?: { id: string; text?: string; username?: string; timestamp?: string }[] }>(
      await fetch(`${TH}/${p.id}/replies?${qs({ fields: "id,text,username,timestamp", access_token: token })}`),
      "Threads",
    ).catch(() => ({ data: [] }));
    const shares = (ins.reposts ?? 0) + (ins.quotes ?? 0) + (ins.shares ?? 0);
    return {
      externalId: p.id,
      permalink: p.permalink ?? null,
      text: p.text ?? "",
      mediaType: p.media_type ?? null,
      postedAt: p.timestamp ?? null,
      metrics: {
        views: ins.views ?? null,
        reach: null,
        likes: ins.likes ?? null,
        comments: ins.replies ?? null,
        shares: Object.keys(ins).length ? shares : null,
        saves: null,
      },
      replies: (replies.data ?? []).map((c) => ({ externalId: c.id, author: c.username ?? "", text: c.text ?? "", likeCount: null, postedAt: c.timestamp ?? null })),
    };
  });
  return { followers: followers.followers_count ?? null, items };
}

export const FETCHERS: Record<AnalyticsPlatform, (account: Account) => Promise<PlatformData>> = {
  instagram: fetchInstagram,
  facebook: fetchFacebook,
  threads: fetchThreads,
};
