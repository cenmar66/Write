import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchThreads, parseInsights } from "@/lib/analytics/sources";
import { compact, engagementRate, type ItemRow, summarize } from "@/lib/analytics/summary";
import type { Account } from "@/lib/publish/accounts";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const item = (over: Partial<ItemRow>): ItemRow => ({
  id: Math.random().toString(36), platform: "instagram", external_id: "x", post_id: null, permalink: null, text: "",
  posted_at: "2026-11-01T10:00:00Z", views: null, reach: null, likes: null, comments: null, shares: null, saves: null, metrics_at: null, ...over,
});

describe("summarize", () => {
  it("totals views and engagement in the range only", () => {
    const s = summarize(
      [
        item({ views: 1000, likes: 50, comments: 10 }),
        item({ platform: "facebook", reach: 500, likes: 20, shares: 5 }),
        item({ posted_at: "2026-09-01T00:00:00Z", views: 99999 }), // too old
      ],
      [],
      7,
      NOW,
    );
    expect(s.posts).toBe(2);
    expect(s.views).toBe(1500);
    expect(s.engagements).toBe(85);
    expect(s.rate).toBeCloseTo(85 / 1500);
    expect(s.daily).toHaveLength(7);
    expect(s.daily.find((d) => d.day === "2026-11-01")?.views).toBe(1500);
    expect(s.top[0].views).toBe(1000);
  });

  it("adds up followers across platforms and the change in range", () => {
    const s = summarize([], [
      { platform: "instagram", day: "2026-10-30", followers: 1000 },
      { platform: "instagram", day: "2026-11-04", followers: 1100 },
      { platform: "threads", day: "2026-11-04", followers: 300 },
    ], 30, NOW);
    expect(s.followers).toBe(1400);
    expect(s.followersChange).toBe(100);
  });

  it("handles unknown views", () => {
    expect(engagementRate(item({ likes: 5 }))).toBeNull();
    expect(summarize([item({ likes: 5 })], [], 7, NOW).rate).toBeNull();
    expect(compact(1234)).toBe("1.2K");
    expect(compact(null)).toBe("–");
  });
});

describe("platform parsing", () => {
  it("reads both insight shapes", () => {
    expect(parseInsights({ data: [{ name: "views", values: [{ value: 42 }] }, { name: "likes", total_value: { value: 7 } }, { name: "bad" }] })).toEqual({ views: 42, likes: 7 });
    expect(parseInsights(null)).toEqual({});
  });

  afterEach(() => vi.unstubAllGlobals());
  it("pulls Threads posts, numbers and replies (mocked API)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (u.pathname.endsWith("/me/threads_insights")) return json({ data: [{ name: "followers_count", total_value: { value: 812 } }] });
      if (u.pathname.endsWith("/me/threads")) return json({ data: [{ id: "t1", text: "Hello", permalink: "https://threads.net/t1", timestamp: "2026-11-02T00:00:00Z", media_type: "TEXT_POST" }, { id: "r1", media_type: "REPOST_FACADE" }] });
      if (u.pathname.endsWith("/t1/insights")) return json({ data: [{ name: "views", values: [{ value: 900 }] }, { name: "likes", values: [{ value: 30 }] }, { name: "replies", values: [{ value: 2 }] }, { name: "reposts", values: [{ value: 1 }] }] });
      if (u.pathname.endsWith("/t1/replies")) return json({ data: [{ id: "c1", text: "Great point", username: "ana", timestamp: "2026-11-02T01:00:00Z" }] });
      return new Response(JSON.stringify({ error: { message: "unexpected" } }), { status: 400 });
    }));
    const account = { platform: "threads", token: "tok", accountId: "me", meta: {} } as unknown as Account;
    const data = await fetchThreads(account);
    expect(data.followers).toBe(812);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].metrics).toMatchObject({ views: 900, likes: 30, comments: 2, shares: 1 });
    expect(data.items[0].replies[0]).toMatchObject({ author: "ana", text: "Great point" });
  });
});
