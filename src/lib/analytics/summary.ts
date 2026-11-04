// Turns stored posts and follower counts into the numbers the Analytics page shows.

export type ItemRow = {
  id: string;
  platform: string;
  external_id: string;
  post_id: string | null;
  permalink: string | null;
  text: string;
  posted_at: string | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  metrics_at: string | null;
};
export type StatRow = { platform: string; day: string; followers: number | null };

/** Likes + comments + shares + saves (whatever the platform reports). */
export const engagements = (i: Pick<ItemRow, "likes" | "comments" | "shares" | "saves">) => (i.likes ?? 0) + (i.comments ?? 0) + (i.shares ?? 0) + (i.saves ?? 0);
/** Views, or reach where a platform only reports reach (Facebook). */
export const seen = (i: Pick<ItemRow, "views" | "reach">) => i.views ?? i.reach ?? null;
/** Engagements per view, as a fraction, or null when views are unknown. */
export const engagementRate = (i: Pick<ItemRow, "views" | "reach" | "likes" | "comments" | "shares" | "saves">) => {
  const v = seen(i);
  return v ? engagements(i) / v : null;
};

export type Summary = {
  posts: number;
  views: number;
  engagements: number;
  rate: number | null;
  followers: number | null;
  followersChange: number | null;
  daily: { day: string; views: number; posts: number }[];
  top: ItemRow[];
};

const DAY = 86_400_000;

/** Numbers for the last `days` days, ending `now`. */
export function summarize(items: ItemRow[], stats: StatRow[], days: number, now: number): Summary {
  const since = now - days * DAY;
  const inRange = items.filter((i) => i.posted_at && new Date(i.posted_at).getTime() >= since);
  const views = inRange.reduce((a, i) => a + (seen(i) ?? 0), 0);
  const eng = inRange.reduce((a, i) => a + engagements(i), 0);
  const viewed = inRange.filter((i) => seen(i));
  const viewedTotal = viewed.reduce((a, i) => a + (seen(i) ?? 0), 0);
  const rate = viewedTotal ? viewed.reduce((a, i) => a + engagements(i), 0) / viewedTotal : null;

  // Followers: the latest count per platform, and the change since the first count in range.
  const byPlatform = new Map<string, StatRow[]>();
  for (const s of stats) if (s.followers !== null) byPlatform.set(s.platform, [...(byPlatform.get(s.platform) ?? []), s]);
  let followers: number | null = null;
  let change: number | null = null;
  const sinceDay = new Date(since).toISOString().slice(0, 10);
  for (const rows of byPlatform.values()) {
    const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const last = sorted[sorted.length - 1];
    followers = (followers ?? 0) + (last.followers ?? 0);
    const first = sorted.find((r) => r.day >= sinceDay);
    if (first && first !== last) change = (change ?? 0) + (last.followers ?? 0) - (first.followers ?? 0);
  }

  const daily: Summary["daily"] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now - d * DAY).toISOString().slice(0, 10);
    const today = inRange.filter((i) => i.posted_at!.slice(0, 10) === day);
    daily.push({ day, views: today.reduce((a, i) => a + (seen(i) ?? 0), 0), posts: today.length });
  }

  const top = [...inRange].sort((a, b) => (seen(b) ?? engagements(b)) - (seen(a) ?? engagements(a)) || engagements(b) - engagements(a)).slice(0, 5);
  return { posts: inRange.length, views, engagements: eng, rate, followers, followersChange: change, daily, top };
}

/** 1234 → "1.2K", 1500000 → "1.5M". */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
