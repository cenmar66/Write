"use client";

import { Check, Copy, Fingerprint, Hash, Loader2, Minimize2, Plus, RotateCcw, Save, ScanSearch, Trash2, X } from "lucide-react";
import { useState } from "react";
import { slopReport } from "@/lib/editor/style-check";
import type { GeneratedPost } from "@/lib/social/ai";
import { countChars, fullText, PLATFORMS } from "@/lib/social/platforms";
import { PlatformBadge } from "./platform-badge";
import { editPostText, SmartTextarea } from "./smart-textarea";

const SLOP_LINE = { low: "Sounds like you.", medium: "A few AI tells.", high: "Reads like AI." } as const;

export type EditablePost = GeneratedPost & { id?: string; savedAt?: string | null };

const FORMAT_LABEL = { single: "Post", thread: "Thread", carousel: "Carousel" } as const;

/** One social post: edit it, watch the character count, trim it, copy it, save it. */
export function PostCard({
  post,
  onChange,
  onSave,
  onRemove,
  saving,
}: {
  post: EditablePost;
  onChange: (p: EditablePost) => void;
  onSave?: () => void;
  onRemove?: () => void;
  saving?: boolean;
}) {
  const platform = PLATFORMS[post.platform];
  const [copied, setCopied] = useState(false);
  const [fitting, setFitting] = useState<number | "main" | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [check, setCheck] = useState(false);
  const [humanizing, setHumanizing] = useState(false);
  const [undo, setUndo] = useState<EditablePost | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const isSingle = post.format === "single";
  const isCarousel = post.format === "carousel";
  // Single posts and carousel captions are measured against the platform limit.
  const hasMain = isSingle || isCarousel;
  const posted = hasMain ? fullText(post.platform, post.content, post.hashtags) : "";
  const used = hasMain ? countChars(post.platform, posted) : 0;
  const over = hasMain && used > platform.limit;
  const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
  const partsOver = post.format === "thread" && post.parts.some((p) => countChars(post.platform, p) > platform.limit);

  const update = (patch: Partial<EditablePost>) => onChange({ ...post, ...patch, savedAt: null });
  const whole = [hasMain ? post.content : "", ...post.parts].filter((t) => t.trim()).join("\n\n");
  const report = check ? slopReport(whole) : null;

  /** Humanize every part of the post at once; Undo puts it back. */
  async function humanizeAll() {
    setHumanizing(true);
    setCheckError(null);
    const before = post;
    try {
      const fix = (t: string) => (t.trim() ? editPostText({ action: "humanize", text: t, post: whole, platform: post.platform }) : Promise.resolve(t));
      const [content, ...parts] = await Promise.all([hasMain ? fix(post.content) : Promise.resolve(post.content), ...post.parts.map(fix)]);
      update({ content, parts });
      setUndo(before);
    } catch (e) {
      setCheckError((e as Error).message || "Couldn't humanize right now.");
    }
    setHumanizing(false);
  }

  async function fit(index: number | "main") {
    setFitting(index);
    const text = index === "main" ? post.content : post.parts[index];
    try {
      const res = await fetch("/api/ai/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "fit", platform: post.platform, text }),
      });
      const body = (await res.json()) as { content?: string; error?: string };
      if (body.content) {
        if (index === "main") update({ content: body.content });
        else update({ parts: post.parts.map((p, i) => (i === index ? body.content! : p)) });
      }
    } finally {
      setFitting(null);
    }
  }

  // Thread posts: copy one at a time (hashtags go on the last post). Ticks show what you've copied.
  const [copiedParts, setCopiedParts] = useState<Set<number>>(new Set());
  const [justCopied, setJustCopied] = useState<number | null>(null);
  const partText = (i: number) =>
    post.parts[i] + (i === post.parts.length - 1 && post.hashtags.length ? `\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}` : "");
  async function copyPart(i: number) {
    await navigator.clipboard.writeText(partText(i));
    setCopiedParts((s) => new Set(s).add(i));
    setJustCopied(i);
    setTimeout(() => setJustCopied((j) => (j === i ? null : j)), 1500);
  }

  async function copy() {
    const tags = post.hashtags.length ? `\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}` : "";
    const text = isSingle
      ? posted
      : isCarousel
        ? `${post.parts.map((p, i) => `Slide ${i + 1}: ${p}`).join("\n")}\n\nCaption:\n${posted}`
        : post.parts.join("\n\n") + tags;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function addTag() {
    const tag = tagInput.replace(/^#+/, "").replace(/\s+/g, "");
    if (tag && !post.hashtags.includes(tag)) update({ hashtags: [...post.hashtags, tag] });
    setTagInput("");
  }

  return (
    <article className="glass flex min-w-0 flex-col rounded-3xl p-4 sm:p-5">
      <header className="flex items-center gap-2">
        <PlatformBadge platform={post.platform} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {platform.label} <span className="text-muted">· {FORMAT_LABEL[post.format]}</span>
          </p>
          {post.angle && <p className="truncate text-xs text-muted">{post.angle}</p>}
        </div>
        <button
          onClick={() => setCheck(!check)}
          aria-label="Slop check"
          aria-pressed={check}
          title="Slop check: filler, clichés and AI-sounding phrases"
          className={`rounded-full p-1.5 transition ${check ? "bg-surface-strong text-ink" : "text-muted hover:bg-surface-strong hover:text-ink"}`}
        >
          <ScanSearch size={16} />
        </button>
        {onRemove && (
          <button onClick={onRemove} aria-label="Remove post" className="rounded-full p-1.5 text-muted hover:bg-surface-strong hover:text-red-700 dark:hover:text-red-400">
            <X size={16} />
          </button>
        )}
      </header>

      {report && (
        <div className="mt-3 rounded-2xl bg-surface-strong/60 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">Slop: {report.level === "low" ? "Low" : report.level === "medium" ? "Medium" : "High"}</span>
            <span className="text-muted">{report.words < 8 ? "Too short to judge." : SLOP_LINE[report.level]}</span>
            <span className="ml-auto flex gap-1.5">
              {undo && (
                <button
                  onClick={() => {
                    onChange({ ...undo, savedAt: null });
                    setUndo(null);
                  }}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-line hover:bg-bg"
                >
                  <RotateCcw size={12} /> Undo
                </button>
              )}
              {report.items.length > 0 && (
                <button onClick={humanizeAll} disabled={humanizing} className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs text-bg disabled:opacity-60">
                  {humanizing ? <Loader2 size={12} className="animate-spin" /> : <Fingerprint size={12} />} Humanize post
                </button>
              )}
            </span>
          </div>
          {report.items.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              {report.items.map((i) => (
                <span key={i.id} title={i.hint}>
                  {i.label} <b className="font-medium text-ink tabular-nums">{i.count}</b>
                </span>
              ))}
            </p>
          )}
          {checkError && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{checkError}</p>}
        </div>
      )}

      {hasMain && (
        <div className="mt-3">
          {isCarousel && <p className="mb-1 text-xs font-medium text-muted">Caption</p>}
          <SmartTextarea
            value={post.content}
            onChange={(content) => update({ content })}
            platform={post.platform}
            post={whole}
            styleCheck={check}
            rows={isCarousel ? 3 : 8}
            resizable
            ariaLabel={`${platform.label} ${isCarousel ? "caption" : "post"}`}
            boxClass="rounded-2xl bg-bg ring-1 ring-line focus-within:ring-2 focus-within:ring-accent"
            textClass="px-3.5 py-3 text-[15px] leading-relaxed"
          />
          {platform.fold && post.content.length > platform.fold && (
            <p className="mt-1.5 text-xs text-muted">
              <span className="font-medium text-ink">Shows before “see more”:</span> {post.content.slice(0, platform.fold).replace(/\n+/g, " ")}…
            </p>
          )}
        </div>
      )}
      {!isSingle && (
        <ol className="mt-3 space-y-2">
          {isCarousel && <li className="text-xs font-medium text-muted">Slides</li>}
          {post.parts.map((part, i) => {
            // Thread posts have a character limit; carousel slides should stay short (about 30 words).
            const n = isCarousel ? words(part) : countChars(post.platform, part);
            const partOver = isCarousel ? n > 40 : n > platform.limit;
            return (
              <li key={i} className="rounded-2xl bg-bg p-2.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium">{post.format === "thread" ? `Post ${i + 1}` : `Slide ${i + 1}`}</span>
                  <span className={`ml-auto tabular-nums ${partOver ? "font-medium text-red-700 dark:text-red-400" : ""}`}>
                    {isCarousel ? `${n} words` : `${n}/${platform.limit}`}
                  </span>
                  {partOver && !isCarousel && (
                    <button onClick={() => fit(i)} disabled={fitting !== null} className="text-accent hover:underline">
                      {fitting === i ? "Shortening…" : "Shorten"}
                    </button>
                  )}
                  {post.format === "thread" && (
                    <button
                      onClick={() => copyPart(i)}
                      aria-label={`Copy post ${i + 1}`}
                      title={copiedParts.has(i) ? "Copied. Click to copy again" : `Copy post ${i + 1}`}
                      className={`flex items-center gap-1 rounded px-1 py-0.5 transition hover:text-ink ${copiedParts.has(i) ? "text-neutral-700 dark:text-neutral-400" : ""}`}
                    >
                      {copiedParts.has(i) ? <Check size={12} /> : <Copy size={12} />}
                      {justCopied === i && <span>Copied</span>}
                    </button>
                  )}
                  <button
                    onClick={() => update({ parts: post.parts.filter((_, j) => j !== i) })}
                    aria-label={`Remove part ${i + 1}`}
                    className="rounded p-0.5 hover:text-red-700 dark:hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <SmartTextarea
                  value={part}
                  onChange={(text) => update({ parts: post.parts.map((p, j) => (j === i ? text : p)) })}
                  platform={post.platform}
                  post={whole}
                  styleCheck={check}
                  rows={2}
                  ariaLabel={`${post.format === "thread" ? "Post" : "Slide"} ${i + 1}`}
                  boxClass=""
                  textClass="px-1 text-[15px] leading-relaxed"
                />
              </li>
            );
          })}
          <li>
            <button
              onClick={() => update({ parts: [...post.parts, ""] })}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:text-ink"
            >
              <Plus size={13} /> Add {post.format === "thread" ? "post" : "slide"}
            </button>
          </li>
        </ol>
      )}

      {/* Hashtags */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {post.hashtags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-full bg-surface-strong py-1 pr-1.5 pl-2.5 text-xs">
            #{tag}
            <button onClick={() => update({ hashtags: post.hashtags.filter((t) => t !== tag) })} aria-label={`Remove #${tag}`} className="opacity-60 hover:opacity-100">
              <X size={11} />
            </button>
          </span>
        ))}
        {post.hashtags.length < platform.maxHashtags && (
          <label className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted ring-1 ring-line ring-dashed">
            <Hash size={11} />
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === " ") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="add tag"
              className="w-16 bg-transparent outline-none placeholder:text-muted"
            />
          </label>
        )}
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {hasMain ? (
          <span className={`text-xs tabular-nums ${over ? "font-medium text-red-700 dark:text-red-400" : "text-muted"}`}>
            {used.toLocaleString()} / {platform.limit.toLocaleString()}
          </span>
        ) : (
          <span className={`text-xs ${partsOver ? "font-medium text-red-700 dark:text-red-400" : "text-muted"}`}>
            {post.parts.length} {post.format === "thread" ? "posts" : "slides"}
            {partsOver ? " · some too long" : ""}
          </span>
        )}
        {over && (
          <button onClick={() => fit("main")} disabled={fitting !== null} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-accent ring-1 ring-accent/40 hover:bg-accent/10">
            {fitting === "main" ? <Loader2 size={12} className="animate-spin" /> : <Minimize2 size={12} />} Shorten to fit
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={copy} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-surface-strong hover:text-ink">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </button>
          {onSave && (
            <button
              onClick={onSave}
              disabled={saving || !!post.savedAt}
              className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-sm text-bg transition disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : post.savedAt ? <Check size={14} /> : <Save size={14} />}
              {post.savedAt ? "Saved" : "Save draft"}
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
