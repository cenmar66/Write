"use client";

import { Check, CornerDownLeft, Loader2, RotateCcw, Sparkles, Square, X } from "lucide-react";

export type Suggestion = {
  label: string;
  text: string;
  status: "streaming" | "done" | "error";
  canReplace: boolean;
};

/** Shows the AI's draft as it streams in, then lets you keep or toss it. */
export function SuggestionCard({
  suggestion,
  onAccept,
  onInsertBelow,
  onRetry,
  onDiscard,
  onStop,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onInsertBelow: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  onStop: () => void;
}) {
  const streaming = suggestion.status === "streaming";

  return (
    <div className="bar fixed inset-x-3 bottom-3 z-40 mx-auto flex max-h-[55dvh] max-w-2xl flex-col rounded-3xl shadow-2xl animate-rise print:hidden md:bottom-6 md:left-64">
      <header className="flex items-center gap-2 px-5 pt-4 pb-2 text-sm">
        <Sparkles size={16} className="text-accent" />
        <span className="font-medium">{suggestion.label}</span>
        {streaming && <Loader2 size={14} className="animate-spin text-muted" />}
        <button onClick={onDiscard} aria-label="Discard" className="ml-auto rounded-full p-1.5 text-muted hover:bg-surface-strong hover:text-ink">
          <X size={16} />
        </button>
      </header>

      <div className="min-h-16 overflow-y-auto px-5 pb-3 leading-relaxed whitespace-pre-wrap">
        {suggestion.text ? <LightMarkdown text={suggestion.text} /> : <span className="text-muted">Thinking…</span>}
        {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-accent align-middle" />}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {streaming ? (
          <button onClick={onStop} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-muted hover:bg-surface-strong hover:text-ink">
            <Square size={13} /> Stop
          </button>
        ) : (
          <>
            {suggestion.status === "done" && suggestion.canReplace && (
              <button onClick={onAccept} className="bg-gradient-brand flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white shadow-md shadow-accent/20">
                <Check size={15} /> Replace
              </button>
            )}
            {suggestion.status === "done" && (
              <button
                onClick={onInsertBelow}
                className={
                  suggestion.canReplace
                    ? "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm hover:bg-surface-strong"
                    : "bg-gradient-brand flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white shadow-md shadow-accent/20"
                }
              >
                <CornerDownLeft size={15} /> {suggestion.canReplace ? "Insert below" : "Insert"}
              </button>
            )}
            <button onClick={onRetry} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-muted hover:bg-surface-strong hover:text-ink">
              <RotateCcw size={14} /> Try again
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

/** Just enough Markdown for a preview: bold, italics, headings, bullets. */
function LightMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const heading = /^#{1,6}\s+/.test(line);
        const clean = line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "• ");
        const parts = clean.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g);
        return (
          <span key={i} className={heading ? "font-display text-lg" : undefined}>
            {parts.map((part, j) =>
              /^\*\*.+\*\*$/.test(part) ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : /^(\*|_).+(\*|_)$/.test(part) ? (
                <em key={j}>{part.slice(1, -1)}</em>
              ) : (
                part
              ),
            )}
            {"\n"}
          </span>
        );
      })}
    </>
  );
}
