"use client";

import { Check, Loader2, Mic, RotateCcw, Square, X } from "lucide-react";
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DictationResult } from "@/lib/ai/dictation";
import { useDictation } from "@/lib/dictation/use-dictation";
import { LightMarkdown } from "../light-markdown";

type Phase = "ready" | "recording" | "cleaning" | "review" | "error";
const AUTO_KEY = "writeai.dictation.autoInsert";

function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Talk, then insert clean text. Used by the editor (and the post composer later).
 * `startNow` begins recording immediately (when opened by a tap or the shortcut).
 */
export type DictationPanelHandle = { toggle: () => void };

export function DictationPanel({
  ref,
  startNow,
  onInsert,
  onCommand,
  onClose,
}: {
  /** `toggle()` is what the keyboard shortcut calls: start, or stop and clean up. */
  ref?: Ref<DictationPanelHandle>;
  startNow: boolean;
  onInsert: (markdown: string) => void;
  onCommand: (result: Extract<DictationResult, { kind: "command" }>) => void;
  onClose: () => void;
}) {
  const dictation = useDictation();
  const [phase, setPhase] = useState<Phase>(startNow ? "recording" : "ready");
  const [raw, setRaw] = useState("");
  const [cleaned, setCleaned] = useState("");
  const [view, setView] = useState<"cleaned" | "raw">("cleaned");
  const [problem, setProblem] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    setAuto(readAuto()); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage is browser-only
  }, []);

  const record = useCallback(() => {
    setProblem(null);
    setRaw("");
    setCleaned("");
    setSeconds(0);
    setPhase("recording");
    dictation.start();
  }, [dictation]);

  useEffect(() => {
    if (startNow && !started.current) {
      started.current = true;
      dictation.start();
    }
  }, [startNow, dictation]);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const finish = useCallback(async () => {
    const transcript = await dictation.stop();
    if (!transcript) {
      setProblem("I didn't catch anything. Try again, a little closer to the mic.");
      setPhase("error");
      return;
    }
    setRaw(transcript);
    setPhase("cleaning");
    try {
      const res = await fetch("/api/ai/dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const result = (await res.json()) as DictationResult | { error: string };
      if ("error" in result) throw new Error(result.error);
      if (result.kind === "command") {
        onCommand(result);
        onClose();
        return;
      }
      setCleaned(result.text);
      if (readAuto()) {
        onInsert(result.text);
        onClose();
        return;
      }
      setView("cleaned");
      setPhase("review");
    } catch (e) {
      // Cleanup failed: still let them use what they said.
      setCleaned("");
      setView("raw");
      setProblem((e as Error).message || "Cleanup failed, but your words are safe.");
      setPhase("review");
    }
  }, [dictation, onCommand, onInsert, onClose]);

  // A recording that failed to start shows as an error.
  const shown: Phase = phase === "recording" && dictation.status === "error" ? "error" : phase;
  const message = problem ?? (dictation.status === "error" ? dictation.error : null);

  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (shown === "recording") finish();
      else if (shown === "ready" || shown === "error") record();
    },
  }));

  function close() {
    dictation.cancel();
    onClose();
  }

  function toggleAuto(on: boolean) {
    setAuto(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {}
  }

  const listening = dictation.status === "listening";
  const ring = 1 + Math.min(dictation.level * 6, 0.6);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const langs = dictation.languages.map((l) => l.slice(0, 2).toUpperCase());

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-h-[70dvh] max-w-2xl flex-col rounded-3xl border border-line bg-bg shadow-2xl animate-rise print:hidden md:bottom-6 md:left-64">
      <header className="flex items-center gap-2 px-5 pt-4 pb-1 text-sm">
        <span className="font-medium">
          {shown === "recording" ? (listening ? "Listening" : "Starting…") : phase === "cleaning" ? "Cleaning up" : phase === "review" ? "Here's what you said" : "Dictation"}
        </span>
        {shown === "recording" && <span className="text-muted tabular-nums">{time}</span>}
        {langs.map((l) => (
          <span key={l} className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] text-muted">
            {l}
          </span>
        ))}
        <button onClick={close} aria-label="Close dictation" className="ml-auto rounded-full p-1.5 text-muted hover:bg-surface-strong hover:text-ink">
          <X size={16} />
        </button>
      </header>

      {(shown === "ready" || shown === "error") && (
        <div className="flex flex-col items-center px-6 pt-4 pb-6 text-center">
          <button
            onClick={record}
            aria-label="Start talking"
            className="bg-gradient-brand grid size-20 place-items-center rounded-full text-white shadow-xl shadow-accent/30 transition hover:scale-105"
          >
            <Mic size={32} />
          </button>
          {message ? (
            <p role="alert" className="mt-4 max-w-sm text-sm text-rose-600 dark:text-rose-300">{message}</p>
          ) : (
            <>
              <p className="mt-4 font-display text-xl">Tap and start talking</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                English or Spanish, I’ll figure it out. Say “new paragraph”, “make that a bullet list”, or “rewrite that shorter”.
              </p>
            </>
          )}
        </div>
      )}

      {shown === "recording" && (
        <>
          <div className="min-h-24 overflow-y-auto px-5 py-3 text-lg leading-relaxed">
            {dictation.finalText}
            {dictation.interim && <span className="text-muted"> {dictation.interim}</span>}
            {!dictation.finalText && !dictation.interim && <span className="text-muted">Go ahead, I’m listening…</span>}
          </div>
          <footer className="flex items-center justify-center gap-6 border-t border-line px-4 py-4">
            <button onClick={close} className="rounded-full px-4 py-2 text-sm text-muted hover:bg-surface-strong hover:text-ink">
              Cancel
            </button>
            <button
              onClick={finish}
              aria-label="Stop and clean up"
              className="relative grid size-16 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30"
            >
              <span
                className="absolute inset-0 rounded-full bg-rose-500/30 transition-transform duration-100"
                style={{ transform: `scale(${listening ? ring : 1})` }}
              />
              <Square size={20} className="relative" fill="currentColor" />
            </button>
            <span className="w-16 text-center text-xs text-muted">Tap to finish</span>
          </footer>
        </>
      )}

      {phase === "cleaning" && (
        <div className="px-5 py-4">
          <p className="leading-relaxed text-muted">{raw}</p>
          <p className="mt-3 flex items-center gap-2 text-sm text-accent">
            <Loader2 size={15} className="animate-spin" /> Removing the ums and fixing punctuation…
          </p>
        </div>
      )}

      {phase === "review" && (
        <>
          <div className="px-5 pt-2">
            <div className="inline-flex rounded-full bg-surface-strong p-1 text-sm" role="tablist">
              {(["cleaned", "raw"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  disabled={v === "cleaned" && !cleaned}
                  onClick={() => setView(v)}
                  className={`rounded-full px-3.5 py-1 transition disabled:opacity-40 ${view === v ? "bg-bg shadow-sm" : "text-muted"}`}
                >
                  {v === "cleaned" ? "Cleaned up" : "Exactly as said"}
                </button>
              ))}
            </div>
            {problem && <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">{problem}</p>}
          </div>
          <div className="min-h-16 overflow-y-auto px-5 py-3 leading-relaxed whitespace-pre-wrap">
            {view === "cleaned" ? <LightMarkdown text={cleaned} /> : raw}
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
            <button
              onClick={() => {
                onInsert(view === "cleaned" ? cleaned : raw);
                onClose();
              }}
              className="bg-gradient-brand flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white shadow-md shadow-accent/20"
            >
              <Check size={15} /> Insert
            </button>
            <button onClick={record} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-muted hover:bg-surface-strong hover:text-ink">
              <RotateCcw size={14} /> Talk again
            </button>
            <label className="ml-auto flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} className="accent-[var(--accent)]" />
              Skip this step next time
            </label>
          </footer>
        </>
      )}
    </div>
  );
}
