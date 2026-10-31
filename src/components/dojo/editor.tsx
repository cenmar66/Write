"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { diffStats, diffWords } from "@/lib/dojo/diff";
import { TARGET_LIST, type TargetSpec } from "@/lib/dojo/targets";
import { modKey } from "./client";

/**
 * Prompt text editor with its own undo/redo history (survives programmatic changes,
 * which break the browser's native undo). Give it a new React `key` to start a fresh
 * history (e.g. when switching to another version).
 */
export function PromptEditor({
  value,
  onChange,
  label,
  minHeight = 260,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  minHeight?: number;
  id?: string;
}) {
  const [hist, setHist] = useState<{ past: string[]; future: string[]; snap: string }>({ past: [], future: [], snap: value });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with content.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight + 2)}px`;
  }, [value, minHeight]);

  const record = (text: string) =>
    setHist((h) => (h.snap === text ? h : { past: [...h.past.slice(-199), h.snap], future: [], snap: text }));
  const snapshot = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    record(value);
  };

  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // Unsnapshotted typing counts as the newest step.
    const past = hist.snap !== value ? [...hist.past, hist.snap] : hist.past;
    const prev = past[past.length - 1];
    if (prev === undefined) return;
    setHist({ past: past.slice(0, -1), future: [...hist.future, value], snap: prev });
    onChange(prev);
  };
  const redo = () => {
    const next = hist.future[hist.future.length - 1];
    if (next === undefined) return;
    setHist({ past: [...hist.past, value], future: hist.future.slice(0, -1), snap: next });
    onChange(next);
  };

  const canUndo = hist.past.length > 0 || hist.snap !== value;
  const canRedo = hist.future.length > 0;

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button type="button" className="pd-btn pd-btn-ghost pd-btn-icon pd-btn-sm" onClick={undo} disabled={!canUndo} aria-label="Undo" title={`Undo (${modKey()}+Z)`}>
          <Undo2 size={15} />
        </button>
        <button type="button" className="pd-btn pd-btn-ghost pd-btn-icon pd-btn-sm" onClick={redo} disabled={!canRedo} aria-label="Redo" title={`Redo (${modKey()}+Shift+Z)`}>
          <Redo2 size={15} />
        </button>
      </div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        ref={ref}
        className="pd-textarea pd-prompt-text block pr-24"
        style={{ minHeight, fontSize: "var(--pd-text)" }}
        value={value}
        spellCheck
        onChange={(e) => {
          onChange(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const next = e.target.value;
          timer.current = setTimeout(() => record(next), 700);
        }}
        onBlur={snapshot}
        onKeyDown={(e) => {
          const mod = e.metaKey || e.ctrlKey;
          if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
            e.preventDefault();
            undo();
          } else if (mod && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
            e.preventDefault();
            redo();
          }
        }}
      />
    </div>
  );
}

export function DiffView({ before, after, labels = ["Before", "After"] }: { before: string; after: string; labels?: [string, string] }) {
  const parts = diffWords(before, after);
  const stats = diffStats(parts);
  const [mode, setMode] = useState<"inline" | "split">("inline");
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="pd-badge pd-badge-ok">+{stats.added} words</span>
        <span className="pd-badge pd-badge-danger">−{stats.removed} words</span>
        <div className="ml-auto flex gap-1" role="tablist" aria-label="Comparison layout">
          <button type="button" role="tab" aria-selected={mode === "inline"} className="pd-chip" onClick={() => setMode("inline")}>
            Inline
          </button>
          <button type="button" role="tab" aria-selected={mode === "split"} className="pd-chip" onClick={() => setMode("split")}>
            Side by side
          </button>
        </div>
      </div>
      {mode === "inline" ? (
        <div className="pd-prompt-text rounded-xl border p-4 pd-line" aria-label="Changes">
          {parts.map((p, i) =>
            p.type === "same" ? (
              <span key={i}>{p.text}</span>
            ) : p.type === "added" ? (
              <ins key={i} className="pd-diff-added">
                {p.text}
              </ins>
            ) : (
              <del key={i} className="pd-diff-removed">
                {p.text}
              </del>
            ),
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {[before, after].map((t, i) => (
            <div key={i}>
              <p className="pd-eyebrow mb-1.5">{labels[i]}</p>
              <div className="pd-prompt-text max-h-[60vh] overflow-y-auto rounded-xl border p-4 pd-line">{t}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TargetPicker({ value, onChange, label = "Target AI model", compact }: { value: TargetSpec; onChange: (t: TargetSpec) => void; label?: string; compact?: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className={compact ? "sr-only" : "mb-1.5 text-sm font-medium"}>{label}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {TARGET_LIST.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={value.id === t.id} className="pd-chip" onClick={() => onChange({ ...value, id: t.id })} title={t.blurb}>
            {t.label}
          </button>
        ))}
      </div>
      {value.id === "custom" && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <input className="pd-input" aria-label="Custom model name" placeholder="Model name, e.g. Llama 4" maxLength={80} value={value.customName ?? ""} onChange={(e) => onChange({ ...value, customName: e.target.value })} />
          <input className="pd-input" aria-label="Notes about this model (optional)" placeholder="Optional notes, e.g. prefers short prompts, 8k context" maxLength={1000} value={value.customNotes ?? ""} onChange={(e) => onChange({ ...value, customNotes: e.target.value })} />
        </div>
      )}
    </fieldset>
  );
}
