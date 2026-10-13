"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlatformBadge } from "@/components/social/platform-badge";
import type { PlatformId } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/client";

type Item = {
  id: string;
  platform: PlatformId;
  content: string;
  parts: string[];
  status: "scheduled" | "publishing" | "published" | "failed";
  scheduled_at: string | null;
  published_at: string | null;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // weeks start on Monday
  return x;
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const itemDate = (i: Item) => new Date((i.status === "published" ? i.published_at : i.scheduled_at) ?? i.scheduled_at ?? 0);
const timeLabel = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const STATUS_STYLE: Record<Item["status"], string> = {
  scheduled: "bg-accent/10 ring-accent/30",
  publishing: "bg-accent/10 ring-accent/30",
  published: "bg-emerald-500/10 ring-emerald-500/30",
  failed: "bg-rose-500/10 ring-rose-500/40",
};

export function ContentCalendar() {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [items, setItems] = useState<Item[]>([]);

  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor);
      return { start, days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    return { start, days: Array.from({ length: 42 }, (_, i) => addDays(start, i)) };
  }, [view, anchor]);

  useEffect(() => {
    const from = range.start.toISOString();
    const to = addDays(range.days[range.days.length - 1], 1).toISOString();
    supabase
      .from("posts")
      .select("id,platform,content,parts,status,scheduled_at,published_at")
      .in("status", ["scheduled", "publishing", "published", "failed"])
      .or(`and(scheduled_at.gte.${from},scheduled_at.lt.${to}),and(published_at.gte.${from},published_at.lt.${to})`)
      .then(({ data }) => setItems((data as Item[]) ?? []));
  }, [supabase, range]);

  const move = (dir: number) =>
    setAnchor((a) => (view === "week" ? addDays(a, dir * 7) : new Date(a.getFullYear(), a.getMonth() + dir, 1)));
  const today = new Date();
  const title =
    view === "week"
      ? `${range.days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${range.days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const forDay = (d: Date) => items.filter((i) => sameDay(itemDate(i), d)).sort((a, b) => itemDate(a).getTime() - itemDate(b).getTime());

  return (
    <div className="animate-rise pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Calendar</h1>
          <p className="mt-1 text-muted">{title}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-surface-strong p-1 text-sm">
            {(["week", "month"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-full px-3.5 py-1 capitalize transition ${view === v ? "bg-bg shadow-sm" : "text-muted"}`}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => move(-1)} aria-label="Previous" className="glass rounded-full p-2 text-muted hover:text-ink"><ChevronLeft size={18} /></button>
          <button onClick={() => setAnchor(new Date())} className="glass rounded-full px-3.5 py-1.5 text-sm">Today</button>
          <button onClick={() => move(1)} aria-label="Next" className="glass rounded-full p-2 text-muted hover:text-ink"><ChevronRight size={18} /></button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
        <Legend className="bg-accent/30" label="Scheduled" />
        <Legend className="bg-emerald-500/40" label="Published" />
        <Legend className="bg-rose-500/40" label="Failed" />
      </div>

      {view === "week" ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-7 md:gap-2">
          {range.days.map((d, i) => {
            const list = forDay(d);
            return (
              <div key={i} className={`glass flex min-h-28 min-w-0 flex-col rounded-2xl p-2.5 md:min-h-[60dvh] ${sameDay(d, today) ? "ring-2 ring-accent" : ""}`}>
                <p className="mb-2 flex items-baseline gap-1.5 px-1 text-sm">
                  <span className="text-muted">{DAY_NAMES[i]}</span>
                  <span className="font-medium">{d.getDate()}</span>
                </p>
                <div className="space-y-1.5">
                  {list.map((it) => <Chip key={it.id} item={it} />)}
                  {!list.length && <p className="px-1 text-xs text-muted/60 md:hidden">Nothing planned</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            {DAY_NAMES.map((n) => <span key={n} className="py-1">{n}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {range.days.map((d, i) => {
              const list = forDay(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              return (
                <button
                  key={i}
                  onClick={() => {
                    setAnchor(d);
                    setView("week");
                  }}
                  className={`glass flex aspect-square min-w-0 flex-col items-stretch rounded-xl p-1 text-left sm:aspect-auto sm:min-h-24 sm:p-1.5 ${inMonth ? "" : "opacity-40"} ${sameDay(d, today) ? "ring-2 ring-accent" : ""}`}
                >
                  <span className="px-0.5 text-xs font-medium">{d.getDate()}</span>
                  <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden">
                    {list.slice(0, 4).map((it) => <PlatformBadge key={it.id} platform={it.platform} size="sm" />)}
                  </span>
                  <span className="hidden space-y-0.5 sm:block">
                    {list.slice(0, 3).map((it) => (
                      <span key={it.id} className={`flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-[11px] ring-1 ${STATUS_STYLE[it.status]}`}>
                        <PlatformBadge platform={it.platform} size="sm" />
                        <span className="truncate">{timeLabel(itemDate(it))}</span>
                      </span>
                    ))}
                    {list.length > 3 && <span className="px-1 text-[11px] text-muted">+{list.length - 3} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Link href="/posts" className="mt-6 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
        <Plus size={15} /> Plan a new post
      </Link>
    </div>
  );
}

function Chip({ item }: { item: Item }) {
  const text = (item.content || item.parts[0] || "").split("\n")[0];
  return (
    <Link href={`/posts/${item.id}`} className={`block rounded-xl p-2 text-xs ring-1 transition hover:-translate-y-0.5 ${STATUS_STYLE[item.status]}`}>
      <span className="flex items-center gap-1.5">
        <PlatformBadge platform={item.platform} size="sm" />
        <span className="font-medium">{timeLabel(itemDate(item))}</span>
        {item.platform === "x" && item.status === "scheduled" && <span className="text-muted">reminder</span>}
      </span>
      <span className="mt-1 line-clamp-2 text-ink/80">{text}</span>
    </Link>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
