"use client";

import { AlertTriangle, CalendarClock, Check, CheckCircle2, ExternalLink, ImagePlus, Images, Loader2, Quote, Send, Trash2, Undo2, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { uploadMedia } from "@/lib/media";
import { AUTO_PLATFORMS, type MediaItem } from "@/lib/publish/types";
import { countChars, fullText, PLATFORMS, type PlatformId, type PostFormat } from "@/lib/social/platforms";
import { type BrandKit, DEFAULT_BRAND, renderCard } from "@/lib/social/quote-card";
import { createClient } from "@/lib/supabase/client";

export type PublishState = {
  id: string;
  platform: PlatformId;
  format: PostFormat;
  content: string;
  parts: string[];
  hashtags: string[];
  media: MediaItem[];
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  scheduled_at: string | null;
  published_at: string | null;
  external_url: string | null;
  error: string | null;
};

/** datetime-local wants local time without a timezone. */
function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function PublishPanel({
  post,
  dirty,
  saveContent,
  onUpdated,
}: {
  post: PublishState;
  /** True when the editor above has unsaved changes. */
  dirty: boolean;
  saveContent: () => Promise<boolean>;
  onUpdated: (patch: Partial<PublishState>) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const platform = PLATFORMS[post.platform];
  const auto = AUTO_PLATFORMS.includes(post.platform);
  const [account, setAccount] = useState<{ status: string; account_name: string } | null | undefined>(undefined);
  const [brand, setBrand] = useState<BrandKit>(DEFAULT_BRAND);
  const [time, setTime] = useState(() => toLocalInput(post.scheduled_at ? new Date(post.scheduled_at) : new Date(Date.now() + 3_600_000)));
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (auto) {
      supabase
        .from("connected_accounts")
        .select("status,account_name")
        .eq("platform", post.platform)
        .maybeSingle()
        .then(({ data }) => setAccount(data));
    }
    supabase
      .from("user_settings")
      .select("brand_kit")
      .maybeSingle()
      .then(({ data }) => data?.brand_kit && setBrand({ ...DEFAULT_BRAND, ...data.brand_kit }));
  }, [supabase, post.platform, auto]);

  const text = post.format === "thread" ? post.parts.join("\n\n") : fullText(post.platform, post.content, post.hashtags);
  const tooLong =
    post.format === "thread"
      ? post.parts.some((p) => countChars(post.platform, p) > platform.limit)
      : countChars(post.platform, fullText(post.platform, post.content, post.hashtags)) > platform.limit;
  const needsMedia = post.platform === "instagram" && post.media.length === 0;
  const blocked = tooLong ? "The post is over the character limit." : needsMedia ? "Instagram needs at least one image or video." : null;
  const connected = account?.status === "connected";

  async function setMedia(media: MediaItem[]) {
    onUpdated({ media });
    await supabase.from("posts").update({ media, updated_at: new Date().toISOString() }).eq("id", post.id);
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    setProblem(null);
    try {
      const added: MediaItem[] = [];
      for (const f of Array.from(files)) added.push(await uploadMedia(supabase, f));
      await setMedia([...post.media, ...added].slice(0, 10));
    } catch (e) {
      setProblem((e as Error).message);
    }
    setBusy(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function quoteCard() {
    const source = (post.content || post.parts[0] || "").split("\n").find((l) => l.trim()) ?? "";
    const quote = prompt("Text for the quote card:", source.slice(0, 220));
    if (!quote?.trim()) return;
    setBusy("card");
    try {
      const blob = await renderCard({ text: quote, brand });
      await setMedia([...post.media, await uploadMedia(supabase, blob, "image")].slice(0, 10));
    } catch (e) {
      setProblem((e as Error).message);
    }
    setBusy(null);
  }

  async function slidesToImages() {
    setBusy("slides");
    try {
      const items: MediaItem[] = [];
      for (const [i, slide] of post.parts.slice(0, 10).entries()) {
        const blob = await renderCard({ text: slide, brand, footer: `${i + 1}/${Math.min(post.parts.length, 10)}` });
        items.push(await uploadMedia(supabase, blob, "image"));
      }
      await setMedia(items);
    } catch (e) {
      setProblem((e as Error).message);
    }
    setBusy(null);
  }

  async function postNow() {
    if (!(await saveContent())) return setProblem("Couldn't save your edits first.");
    setBusy("publish");
    setProblem(null);
    onUpdated({ status: "publishing" });
    const res = await fetch(`/api/posts/${post.id}/publish`, { method: "POST" });
    const body = (await res.json()) as { ok: boolean; url?: string | null; error?: string };
    if (body.ok) onUpdated({ status: "published", published_at: new Date().toISOString(), external_url: body.url ?? null, error: null });
    else onUpdated({ status: "failed", error: body.error ?? "Publishing failed." });
    setBusy(null);
  }

  async function schedule() {
    const at = new Date(time);
    if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000) return setProblem("Pick a time in the future.");
    if (!(await saveContent())) return setProblem("Couldn't save your edits first.");
    setBusy("schedule");
    const patch = { status: "scheduled" as const, scheduled_at: at.toISOString(), error: null };
    const { error } = await supabase.from("posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", post.id);
    if (error) setProblem("Couldn't schedule. Try again.");
    else onUpdated(patch);
    setBusy(null);
  }

  async function unschedule() {
    setBusy("unschedule");
    await supabase.from("posts").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", post.id);
    onUpdated({ status: "draft" });
    setBusy(null);
  }

  async function copyAndOpenX() {
    const thread = post.format === "thread" && post.parts.length > 1;
    // Threads: post 1 is pre-filled in X, and post 2 is already on your clipboard, ready to paste as the next one.
    await navigator.clipboard.writeText(thread ? post.parts[1] : text);
    const first = thread ? post.parts[0] : text;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(first)}`, "_blank", "noopener");
    if (thread) setXHint(true);
  }

  const [xHint, setXHint] = useState(false);

  async function markPosted() {
    const patch = { status: "published" as const, published_at: new Date().toISOString() };
    await supabase.from("posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", post.id);
    onUpdated(patch);
  }

  const showMedia = post.platform !== "x";
  const due = post.status === "scheduled" && post.scheduled_at && new Date(post.scheduled_at) <= new Date();

  return (
    <section className="glass mt-4 space-y-5 rounded-3xl p-5 sm:p-6">
      {/* Status */}
      {post.status === "published" && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={16} /> Published {post.published_at ? when(post.published_at) : ""}.
          {post.external_url && (
            <a href={post.external_url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 font-medium underline">
              View post <ExternalLink size={13} />
            </a>
          )}
        </p>
      )}
      {post.status === "scheduled" && post.scheduled_at && (
        <p className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ${due && !auto ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-accent/10 text-accent"}`}>
          <CalendarClock size={16} />
          {due && !auto ? `Ready to post (was due ${when(post.scheduled_at)}).` : `Scheduled for ${when(post.scheduled_at)}${auto ? "" : " (reminder)"}.`}
        </p>
      )}
      {post.status === "publishing" && (
        <p className="flex items-center gap-2 rounded-2xl bg-accent/10 px-4 py-3 text-sm text-accent">
          <Loader2 size={16} className="animate-spin" /> Publishing… videos can take a few minutes.
        </p>
      )}
      {post.status === "failed" && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>Didn’t publish: {post.error}</span>
        </p>
      )}

      {/* Media */}
      {showMedia && post.status !== "published" && (
        <div>
          <p className="text-sm font-medium">
            Media {post.platform === "instagram" && <span className="font-normal text-muted">(1 image, up to 10 for a carousel, or 1 video for a Reel)</span>}
          </p>
          {post.media.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {post.media.map((m, i) => (
                <div key={m.url} className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-surface-strong">
                  {m.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user media from storage
                    <img src={m.url} alt={`Media ${i + 1}`} className="size-full object-cover" />
                  ) : (
                    <video src={m.url} className="size-full object-cover" muted playsInline />
                  )}
                  <button
                    onClick={() => setMedia(post.media.filter((_, j) => j !== i))}
                    aria-label={`Remove media ${i + 1}`}
                    className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white"
                  >
                    <Trash2 size={12} />
                  </button>
                  {m.type === "video" && <Video size={14} className="absolute bottom-1.5 left-1.5 text-white drop-shadow" />}
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <SmallButton onClick={() => fileInput.current?.click()} busy={busy === "upload"} icon={<ImagePlus size={14} />}>
              Add photos or video
            </SmallButton>
            <SmallButton onClick={quoteCard} busy={busy === "card"} icon={<Quote size={14} />}>
              Make a quote card
            </SmallButton>
            {post.format === "carousel" && post.parts.length > 0 && (
              <SmallButton onClick={slidesToImages} busy={busy === "slides"} icon={<Images size={14} />}>
                Turn slides into images
              </SmallButton>
            )}
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={post.platform === "instagram" ? "image/*,video/mp4,video/quicktime" : "image/*"}
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Quote cards use your <Link href="/settings" className="underline">brand kit</Link>.
          </p>
        </div>
      )}

      {/* Actions */}
      {post.status !== "published" && post.status !== "publishing" && (
        <div className="space-y-3 border-t border-line pt-4">
          {dirty && <p className="text-xs text-muted">Your edits will be saved first.</p>}
          {post.platform === "x" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={copyAndOpenX} className="flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black">
                <Send size={15} /> Copy & open X
              </button>
              <button onClick={markPosted} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-muted ring-1 ring-line hover:text-ink">
                <Check size={14} /> Mark as posted
              </button>
              <p className="w-full text-xs text-muted">
                {post.format === "thread"
                  ? xHint
                    ? "Post 1 is filled in and post 2 is on your clipboard. In X, tap + to add each next post to the thread before posting, using the copy icons above (a tick shows what you've copied)."
                    : "X opens with post 1 filled in, and post 2 is copied. Use the small copy icon on each post above for the rest."
                  : "Your post is copied and X opens with it filled in."}
              </p>
            </div>
          ) : account === null ? (
            <p className="text-sm text-muted">
              Connect {platform.label} in <Link href="/settings#accounts" className="text-accent underline">Settings</Link> to post automatically.
            </p>
          ) : account && !connected ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">
              {platform.label} needs reconnecting. <Link href="/settings#accounts" className="underline">Open Settings</Link>
            </p>
          ) : (
            <button
              onClick={postNow}
              disabled={!!blocked || !!busy || account === undefined}
              className="bg-gradient-brand flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-accent/20 disabled:opacity-50"
            >
              {busy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {post.status === "failed" ? "Try again" : `Post to ${platform.label} now`}
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Schedule time"
              className="rounded-xl bg-bg px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={schedule}
              disabled={(!!blocked && auto) || !!busy}
              className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50"
            >
              {busy === "schedule" ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
              {post.status === "scheduled" ? "Reschedule" : auto ? "Schedule" : "Set reminder"}
            </button>
            {post.status === "scheduled" && (
              <button onClick={unschedule} disabled={!!busy} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted hover:text-ink">
                <Undo2 size={14} /> Unschedule
              </button>
            )}
          </div>
          {auto && account === null && <p className="text-xs text-muted">Scheduled posts go out once the account is connected.</p>}
          {blocked && <p className="text-xs text-rose-500">{blocked}</p>}
        </div>
      )}
      {problem && <p className="text-sm text-rose-500">{problem}</p>}
    </section>
  );
}

function SmallButton({ onClick, busy, icon, children }: { onClick: () => void; busy: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={busy} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm ring-1 ring-line transition hover:bg-surface-strong disabled:opacity-60">
      {busy ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
