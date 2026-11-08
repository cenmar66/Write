"use client";

import { ArrowUpRight, BarChart3, Loader2, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformBadge } from "@/components/social/platform-badge";
import { timeAgo } from "@/lib/docs";
import { compact, engagementRate, engagements, type ItemRow, seen, type StatRow, summarize } from "@/lib/analytics/summary";
import type { PlatformId } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/client";

type Platform = "instagram" | "facebook" | "threads";
const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "threads", label: "Threads" },
];
type CommentRow = { id: string; item_id: string; platform: string; author: string; text: string; posted_at: string | null };
type AccountRow = { platform: string; account_name: string; status: string };
type SyncResult = { platform: Platform; status: "ok" | "not_connected" | "reconnect" | "error"; items?: number; comments?: number; error?: string };
type Insights = { summary: string; working: string[]; commentThemes: string[]; questions: string[]; nextPosts: string[] };
type Tab = "overview" | "posts" | "comments";
type Sort = "views" | "engagement" | "rate" | "comments" | "recent";

export function AnalyticsDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [now, setNow] = useState(0);
  const [days, setDays] = useState(30);
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [tab, setTab] = useState<Tab>("overview");
  const [sort, setSort] = useState<Sort>("views");
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, s, c, a] = await Promise.all([
      supabase.from("social_items").select("id,platform,external_id,post_id,permalink,text,posted_at,views,reach,likes,comments,shares,saves,metrics_at").order("posted_at", { ascending: false }).limit(500),
      supabase.from("social_account_stats").select("platform,day,followers").order("day").limit(2000),
      supabase.from("social_comments").select("id,item_id,platform,author,text,posted_at").order("posted_at", { ascending: false }).limit(300),
      supabase.from("connected_accounts").select("platform,account_name,status").in("platform", ["instagram", "facebook", "threads", "linkedin"]),
    ]);
    setNow(Date.now());
    setItems((i.data as ItemRow[]) ?? []);
    setStats((s.data as StatRow[]) ?? []);
    setComments((c.data as CommentRow[]) ?? []);
    setAccounts((a.data as AccountRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function refresh() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/sync", { method: "POST" });
      const body = (await res.json()) as { results?: SyncResult[]; error?: string };
      if (!body.results) throw new Error(body.error ?? "Refresh failed.");
      setResults(body.results);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setSyncing(false);
  }

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) });
      const body = (await res.json()) as Insights & { error?: string };
      if (body.error) throw new Error(body.error);
      setInsights(body);
    } catch (e) {
      setError((e as Error).message);
    }
    setAnalyzing(false);
  }

  const connected = PLATFORMS.filter((p) => accounts.some((a) => a.platform === p.id));
  const filtered = useMemo(() => (items ?? []).filter((i) => platform === "all" || i.platform === platform), [items, platform]);
  const filteredStats = stats.filter((s) => platform === "all" || s.platform === platform);
  const summary = useMemo(() => (now ? summarize(filtered, filteredStats, days, now) : null), [filtered, filteredStats, days, now]);
  const lastUpdate = (items ?? []).reduce<string | null>((m, i) => (i.metrics_at && (!m || i.metrics_at > m) ? i.metrics_at : m), null);
  const itemText = new Map((items ?? []).map((i) => [i.id, i]));
  const empty = items !== null && items.length === 0;

  const since = now - days * 86_400_000;
  const postsInRange = filtered.filter((i) => i.posted_at && new Date(i.posted_at).getTime() >= since);
  const sorted = [...postsInRange].sort((a, b) => {
    if (sort === "recent") return (b.posted_at ?? "").localeCompare(a.posted_at ?? "");
    if (sort === "engagement") return engagements(b) - engagements(a);
    if (sort === "rate") return (engagementRate(b) ?? -1) - (engagementRate(a) ?? -1);
    if (sort === "comments") return (b.comments ?? 0) - (a.comments ?? 0);
    return (seen(b) ?? -1) - (seen(a) ?? -1);
  });
  const commentsInRange = comments.filter((c) => (platform === "all" || c.platform === platform) && (!c.posted_at || new Date(c.posted_at).getTime() >= since));

  return (
    <div className="animate-rise pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            {lastUpdate ? `Updated ${timeAgo(lastUpdate)}` : "Your posts, views, followers and comments, in one place."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={analyze}
            disabled={analyzing || empty || items === null}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm ring-1 ring-line transition hover:bg-surface-strong disabled:opacity-50"
          >
            {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Analyze
          </button>
          <button onClick={refresh} disabled={syncing} className="bg-gradient-brand flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> {syncing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {results && <SyncNotes results={results} />}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-surface-strong p-1 text-sm">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-full px-3.5 py-1 transition ${days === d ? "bg-bg shadow-sm" : "text-muted"}`}>
              {d} days
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-full bg-surface-strong p-1 text-sm">
          {[{ id: "all" as const, label: "All" }, ...PLATFORMS].map((p) => (
            <button key={p.id} onClick={() => setPlatform(p.id)} className={`rounded-full px-3.5 py-1 transition ${platform === p.id ? "bg-bg shadow-sm" : "text-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-line">
        {(["overview", "posts", "comments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm capitalize transition sm:px-4 ${tab === t ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t}
            {t === "comments" && commentsInRange.length ? ` (${commentsInRange.length})` : ""}
          </button>
        ))}
      </div>

      {items === null && <div className="glass mt-6 h-64 animate-pulse rounded-3xl" />}

      {empty && <EmptyState connected={connected.length > 0} syncing={syncing} onRefresh={refresh} />}

      {!empty && summary && tab === "overview" && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Views" value={compact(summary.views)} hint="Facebook counts reach" />
            <Kpi label="Engagement rate" value={summary.rate === null ? "–" : `${(summary.rate * 100).toFixed(1)}%`} hint={`${compact(summary.engagements)} likes, comments, shares, saves`} />
            <Kpi
              label="Followers"
              value={compact(summary.followers)}
              hint={summary.followersChange === null ? "Tracked from your first refresh" : `${summary.followersChange >= 0 ? "+" : ""}${compact(summary.followersChange)} in ${days} days`}
            />
            <Kpi label="Posts" value={String(summary.posts)} hint={`in the last ${days} days`} />
          </section>

          <section className="glass mt-4 rounded-3xl p-5">
            <h2 className="text-sm font-medium">Views by day posted</h2>
            <DailyChart daily={summary.daily} />
          </section>

          {insights && <InsightsCard insights={insights} />}

          <section className="mt-4">
            <h2 className="text-sm font-medium">Top posts</h2>
            <PostList rows={summary.top} />
          </section>
        </>
      )}

      {!empty && summary && tab === "posts" && (
        <section className="mt-4">
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <span className="text-muted">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-full bg-transparent px-3 py-1.5 ring-1 ring-line outline-none" aria-label="Sort posts">
              <option value="views">Views</option>
              <option value="engagement">Engagement</option>
              <option value="rate">Engagement rate</option>
              <option value="comments">Comments</option>
              <option value="recent">Most recent</option>
            </select>
          </div>
          <PostList rows={sorted} />
        </section>
      )}

      {!empty && tab === "comments" && (
        <section className="mt-4 space-y-2">
          {commentsInRange.length === 0 && <p className="py-12 text-center text-muted">No comments in this period.</p>}
          {commentsInRange.map((c) => {
            const on = itemText.get(c.item_id);
            return (
              <div key={c.id} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2 text-sm">
                  <PlatformBadge platform={c.platform as PlatformId} />
                  <span className="font-medium">{c.author || "Someone"}</span>
                  <span className="text-xs text-muted">{c.posted_at ? timeAgo(c.posted_at) : ""}</span>
                  {on?.permalink && (
                    <a href={on.permalink} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-ink">
                      Reply on {c.platform} <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap">{c.text}</p>
                {on && <p className="mt-2 truncate text-xs text-muted">On: {on.text.split("\n")[0] || "a post"}</p>}
              </div>
            );
          })}
        </section>
      )}

      <Sources accounts={accounts} />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted">{hint}</p>
    </div>
  );
}

function DailyChart({ daily }: { daily: { day: string; views: number; posts: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.views));
  return (
    <div className="mt-4">
      <div className="flex h-36 items-end gap-[2px]" role="img" aria-label="Views by day posted">
        {daily.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t-sm ${d.posts ? "bg-ink/80" : "bg-line"}`}
              style={{ height: d.posts ? `${Math.max(4, (d.views / max) * 100)}%` : "2px" }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-bg group-hover:block">
              {new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: {compact(d.views)} views, {d.posts} post{d.posts === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{new Date(`${daily[0]?.day}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function PostList({ rows }: { rows: ItemRow[] }) {
  if (!rows.length) return <p className="py-10 text-center text-muted">No posts in this period.</p>;
  return (
    <ul className="mt-2 space-y-2">
      {rows.map((i) => {
        const rate = engagementRate(i);
        return (
          <li key={i.id} className="glass flex items-center gap-3 rounded-2xl p-4">
            <PlatformBadge platform={i.platform as PlatformId} />
            <div className="min-w-0 flex-1">
              <p className="truncate">{i.text.split("\n")[0] || "(no caption)"}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
                <span>{i.posted_at ? timeAgo(i.posted_at) : ""}</span>
                <span>{compact(seen(i))} {i.views === null && i.reach !== null ? "reach" : "views"}</span>
                <span>{compact(i.likes)} likes</span>
                <span>{compact(i.comments)} comments</span>
                {i.shares !== null && <span>{compact(i.shares)} shares</span>}
                {i.saves !== null && <span>{compact(i.saves)} saves</span>}
                {rate !== null && <span>{(rate * 100).toFixed(1)}% engagement</span>}
                {i.post_id && <Link href={`/posts/${i.post_id}`} className="text-ink underline underline-offset-2">Made in Write.ai</Link>}
              </p>
            </div>
            {i.permalink && (
              <a href={i.permalink} target="_blank" rel="noreferrer" aria-label="Open the post" className="rounded-full p-2 text-muted hover:bg-surface-strong hover:text-ink">
                <ArrowUpRight size={16} />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function InsightsCard({ insights }: { insights: Insights }) {
  const block = (title: string, list: string[]) =>
    list.length > 0 && (
      <div>
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
          {list.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="glass mt-4 space-y-4 rounded-3xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Sparkles size={15} /> What’s working
      </h2>
      <p>{insights.summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {block("Your best posts have in common", insights.working)}
        {block("What people are saying", insights.commentThemes)}
        {block("Questions worth answering", insights.questions)}
        {block("Ideas for next posts", insights.nextPosts)}
      </div>
    </section>
  );
}

function SyncNotes({ results }: { results: SyncResult[] }) {
  const label = (p: string) => PLATFORMS.find((x) => x.id === p)?.label ?? p;
  return (
    <ul className="mt-4 space-y-1 text-sm">
      {results.map((r) => (
        <li key={r.platform} className="text-muted">
          <b className="font-medium text-ink">{label(r.platform)}:</b>{" "}
          {r.status === "ok" && `${r.items} posts, ${r.comments} comments updated.`}
          {r.status === "not_connected" && (
            <>
              not connected. <Link href="/settings#accounts" className="text-ink underline underline-offset-2">Connect it</Link>
            </>
          )}
          {r.status === "reconnect" && (
            <>
              needs permission to read stats. <Link href="/settings#accounts" className="text-ink underline underline-offset-2">Reconnect it</Link> once. ({r.error})
            </>
          )}
          {r.status === "error" && `couldn’t refresh: ${r.error}`}
        </li>
      ))}
    </ul>
  );
}

function Sources({ accounts }: { accounts: AccountRow[] }) {
  return (
    <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
      <p className="flex items-center gap-1.5">
        <BarChart3 size={13} /> Stats come from Instagram, Facebook Pages and Threads ({accounts.filter((a) => a.platform !== "linkedin").length} connected), refreshed daily and when you tap Refresh.
      </p>
      <p className="mt-1">X and personal LinkedIn profiles don’t share post stats with apps like this one, so they aren’t included.</p>
    </footer>
  );
}

function EmptyState({ connected, syncing, onRefresh }: { connected: boolean; syncing: boolean; onRefresh: () => void }) {
  return (
    <div className="relative mt-6">
      <div aria-hidden className="pointer-events-none grid grid-cols-2 gap-3 opacity-40 blur-[3px] lg:grid-cols-4">
        {["Views", "Engagement rate", "Followers", "Posts"].map((k) => (
          <div key={k} className="glass rounded-2xl p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 font-display text-3xl">—</p>
          </div>
        ))}
        <div className="glass col-span-full h-48 rounded-3xl" />
      </div>
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="glass max-w-sm rounded-3xl p-6 text-center shadow-xl" style={{ background: "var(--surface)" }}>
          <MessageCircle className="mx-auto text-muted" />
          <h2 className="mt-3 text-lg font-semibold">See how your posts are doing</h2>
          <p className="mt-1 text-sm text-muted">
            {connected
              ? "Tap Refresh to bring in your recent posts, views, followers and comments."
              : "Connect Instagram, a Facebook Page or Threads, and Write.ai brings in your posts, views, followers and comments."}
          </p>
          {connected ? (
            <button onClick={onRefresh} disabled={syncing} className="bg-gradient-brand mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
              <RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> {syncing ? "Refreshing…" : "Refresh now"}
            </button>
          ) : (
            <Link href="/settings#accounts" className="bg-gradient-brand mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-white">
              Connect a channel
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
