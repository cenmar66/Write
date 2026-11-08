"use client";

import { Baby, Check, ChevronLeft, Fingerprint, Loader2, Maximize2, Minimize2, Palette, PenLine, RotateCcw, SpellCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import { EDIT_ACTIONS, type EditAction, type Tone, TONES } from "@/lib/ai/actions";
import { findStyleIssues, STYLE_KINDS, type StyleIssue } from "@/lib/editor/style-check";
import type { PlatformId } from "@/lib/social/platforms";
import { streamFetch } from "@/lib/stream";

const ACTIONS = [
  ["rewrite", PenLine],
  ["shorten", Minimize2],
  ["expand", Maximize2],
  ["humanize", Fingerprint],
  ["grammar", SpellCheck],
  ["simplify", Baby],
] as const;

/** Style notes for plain text, checked line by line (so "starts with an emoji" means each line). */
export function textIssues(text: string): StyleIssue[] {
  const out: StyleIssue[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    for (const i of findStyleIssues(line)) out.push({ ...i, from: i.from + offset, to: i.to + offset });
    offset += line.length + 1;
  }
  return out;
}

/** The AI sometimes answers in Markdown; social posts are plain text. */
export function toPlain(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    .trim();
}

/** Asks the AI to edit some post text and returns it as plain text. */
export async function editPostText(opts: {
  action: EditAction;
  text: string;
  post: string;
  platform: PlatformId;
  tone?: Tone;
  onText?: (soFar: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const final = await streamFetch(
    "/api/ai/edit",
    { action: opts.action, tone: opts.tone, text: opts.text, document: opts.post, post: { platform: opts.platform } },
    (soFar) => opts.onText?.(toPlain(soFar)),
    opts.signal,
  );
  return toPlain(final);
}

type Run = { from: number; to: number; action: EditAction; tone?: Tone; abort: AbortController };

/**
 * A post text box with the editor's tools: select text for the AI menu (rewrite, shorten,
 * humanize…), and dotted underlines for filler, clichés and AI-sounding phrases when the check is on.
 */
export function SmartTextarea({
  value,
  onChange,
  platform,
  post,
  styleCheck,
  ariaLabel,
  rows = 4,
  boxClass,
  textClass,
  resizable = false,
}: {
  value: string;
  onChange: (text: string) => void;
  platform: PlatformId;
  /** The whole post, for context. */
  post: string;
  styleCheck: boolean;
  ariaLabel?: string;
  rows?: number;
  /** The frame: background, ring, rounding. */
  boxClass: string;
  /** Padding, font size and line height. Shared by the text and its underline layer so they line up. */
  textClass: string;
  resizable?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null);
  const [toneMenu, setToneMenu] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<{ text: string; status: "streaming" | "done" | "error" } | null>(null);

  function trackSelection() {
    const el = area.current;
    if (!el) return;
    setSel(el.selectionEnd > el.selectionStart ? { from: el.selectionStart, to: el.selectionEnd } : null);
  }

  async function start(action: EditAction, tone?: Tone, range = sel) {
    if (!range) return;
    run?.abort.abort();
    const abort = new AbortController();
    setRun({ ...range, action, tone, abort });
    setToneMenu(false);
    setResult({ text: "", status: "streaming" });
    try {
      const text = await editPostText({
        action,
        tone,
        text: value.slice(range.from, range.to),
        post,
        platform,
        signal: abort.signal,
        onText: (soFar) => setResult({ text: soFar, status: "streaming" }),
      });
      setResult({ text, status: "done" });
    } catch (e) {
      setResult((r) => (abort.signal.aborted ? (r?.text ? { text: r.text, status: "done" } : null) : { text: (e as Error).message, status: "error" }));
    }
  }

  function accept() {
    if (!run || !result) return;
    const next = value.slice(0, run.from) + result.text + value.slice(run.to);
    onChange(next);
    setResult(null);
    setRun(null);
    setSel(null);
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(run.from, run.from + result.text.length);
    });
  }

  function discard() {
    run?.abort.abort();
    setResult(null);
    setRun(null);
  }

  const issues = styleCheck ? textIssues(value) : [];
  const pieces: React.ReactNode[] = [];
  let at = 0;
  issues.forEach((i, n) => {
    pieces.push(value.slice(at, i.from));
    pieces.push(
      <span key={n} className={`style-flag style-${i.kind}`}>
        {value.slice(i.from, i.to)}
      </span>,
    );
    at = i.to;
  });
  pieces.push(value.slice(at), "​");

  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the selection while clicking the menu
  const label = run ? (run.action === "tone" ? `Tone: ${run.tone}` : EDIT_ACTIONS[run.action].label) : "";

  return (
    <div className="relative">
      {sel && !result && (
        <div
          role="toolbar"
          aria-label="AI edit"
          className="bar absolute -top-2 right-2 z-20 flex max-w-[calc(100%-1rem)] -translate-y-full flex-wrap items-center gap-0.5 rounded-xl p-1 text-xs shadow-lg"
          style={{ background: "var(--surface)" }}
        >
          {toneMenu ? (
            <>
              <button onMouseDown={keep} onClick={() => setToneMenu(false)} aria-label="Back" className="rounded-lg p-1.5 text-muted hover:bg-surface-strong hover:text-ink">
                <ChevronLeft size={14} />
              </button>
              {TONES.map((t) => (
                <button key={t} onMouseDown={keep} onClick={() => start("tone", t)} className="rounded-lg px-2 py-1.5 hover:bg-surface-strong">
                  {t}
                </button>
              ))}
            </>
          ) : (
            <>
              {ACTIONS.map(([a, Icon]) => (
                <button
                  key={a}
                  onMouseDown={keep}
                  onClick={() => start(a)}
                  title={EDIT_ACTIONS[a].hint}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-surface-strong"
                >
                  <Icon size={13} /> {EDIT_ACTIONS[a].label}
                </button>
              ))}
              <button onMouseDown={keep} onClick={() => setToneMenu(true)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-surface-strong">
                <Palette size={13} /> Tone
              </button>
            </>
          )}
        </div>
      )}

      <div className={`relative ${boxClass}`}>
        {styleCheck && (
          <div
            ref={backdrop}
            aria-hidden
            className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap text-transparent [overflow-wrap:anywhere] ${textClass}`}
          >
            {pieces}
          </div>
        )}
        <textarea
          ref={area}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            trackSelection();
          }}
          onSelect={trackSelection}
          onBlur={() => setSel(null)}
          onScroll={(e) => {
            if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
          }}
          rows={rows}
          aria-label={ariaLabel}
          className={`relative block w-full bg-transparent outline-none [field-sizing:content] [overflow-wrap:anywhere] ${resizable ? "max-h-[28rem] resize-y" : "resize-none"} ${textClass}`}
        />
      </div>

      {styleCheck && issues.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-2 px-1 text-[11px] text-muted">
          {issues.slice(0, 6).map((i, n) => (
            <span key={n} title={i.note}>
              <span className={`style-flag style-${i.kind} text-ink`}>{i.text}</span> {STYLE_KINDS[i.kind].label.toLowerCase()}
            </span>
          ))}
          {issues.length > 6 && <span>+{issues.length - 6} more</span>}
        </p>
      )}

      {result && (
        <div className="mt-2 rounded-xl p-3 text-sm ring-1 ring-line" style={{ background: "var(--surface)" }}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            {result.status === "streaming" && <Loader2 size={12} className="animate-spin" />} {label}
          </p>
          <p className={`mt-1.5 whitespace-pre-wrap ${result.status === "error" ? "text-red-700 dark:text-red-400" : ""}`}>{result.text || "…"}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {result.status === "done" && (
              <button onClick={accept} className="flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs text-bg">
                <Check size={12} /> Replace
              </button>
            )}
            {result.status !== "streaming" && run && (
              <button onClick={() => start(run.action, run.tone, { from: run.from, to: run.to })} className="flex items-center gap-1 rounded-full px-3 py-1 text-xs ring-1 ring-line hover:bg-surface-strong">
                <RotateCcw size={12} /> Try again
              </button>
            )}
            <button onClick={discard} className="flex items-center gap-1 rounded-full px-3 py-1 text-xs text-muted ring-1 ring-line hover:bg-surface-strong">
              <X size={12} /> {result.status === "streaming" ? "Stop" : "Discard"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
