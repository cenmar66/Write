"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { STYLE_KINDS } from "@/lib/editor/style-check";
import { type FocusMode, setWritingModes, styleKey } from "@/lib/editor/writing-modes";

/**
 * Closes a popover on outside click or Escape. (A fixed full-screen backdrop doesn't work
 * inside the blurred toolbars: backdrop-filter traps fixed children inside the bar.)
 */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return ref;
}

export type WritingView = {
  focus: FocusMode;
  typewriter: boolean;
  styleCheck: boolean;
  authorship: boolean;
  quiet: boolean;
};

const DEFAULTS: WritingView = { focus: "off", typewriter: false, styleCheck: false, authorship: true, quiet: true };
const STORE = "writing-view";

/** Your writing-view choices, remembered on this device. */
export function useWritingView(editor: Editor | null) {
  const [view, setView] = useState<WritingView>(DEFAULTS);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<WritingView> | null;
        if (saved) setView({ ...DEFAULTS, ...saved });
      } catch {}
    });
  }, []);

  useEffect(() => {
    if (editor) setWritingModes(editor, { focus: view.focus, typewriter: view.typewriter, styleCheck: view.styleCheck });
  }, [editor, view.focus, view.typewriter, view.styleCheck]);

  const update = (patch: Partial<WritingView>) =>
    setView((v) => {
      const next = { ...v, ...patch };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {}
      return next;
    });

  return [view, update] as const;
}

/** Fades the toolbars and sidebar while you type; any mouse move brings them back. */
export function useQuietChrome(enabled: boolean) {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".tiptap-doc")) return;
      if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace") setTyping(true);
    };
    const wake = (e: Event) => {
      if (e instanceof MouseEvent && Math.abs(e.movementX) + Math.abs(e.movementY) < 4) return;
      setTyping(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, [enabled]);

  const quiet = enabled && typing;
  useEffect(() => {
    document.documentElement.toggleAttribute("data-quiet", quiet);
    return () => document.documentElement.removeAttribute("data-quiet");
  }, [quiet]);
  return quiet;
}

/** Words, reading time, and style notes, kept live as you type. */
export function useDocStats(editor: Editor | null, fallbackWords: number) {
  return (
    useEditorState({
      editor,
      selector: ({ editor: e }) => {
        if (!e) return null;
        const { from, to } = e.state.selection;
        const picked = from === to ? 0 : e.state.doc.textBetween(from, to, " ", " ").split(/\s+/).filter(Boolean).length;
        const words = e.storage.characterCount.words() as number;
        return {
          words,
          picked,
          minutes: Math.max(1, Math.round(words / 238)),
          notes: styleKey.getState(e.state)?.issues ?? [],
          aiWords: countAiWords(e),
        };
      },
    }) ?? { words: fallbackWords, picked: 0, minutes: Math.max(1, Math.round(fallbackWords / 238)), notes: [], aiWords: 0 }
  );
}

function countAiWords(editor: Editor) {
  const type = editor.schema.marks.aiText;
  if (!type) return 0;
  let text = "";
  editor.state.doc.descendants((node) => {
    if (node.isText && type.isInSet(node.marks)) text += ` ${node.text}`;
  });
  return text.split(/\s+/).filter(Boolean).length;
}

/** Removes every AI mark: you've reviewed it, it's yours now. */
export function claimAllText(editor: Editor) {
  const type = editor.schema.marks.aiText;
  if (!type) return;
  editor.chain().command(({ tr }) => {
    tr.removeMark(0, tr.doc.content.size, type);
    return true;
  }).run();
}

export function WritingViewMenu({
  editor,
  view,
  update,
  aiWords,
}: {
  editor: Editor | null;
  view: WritingView;
  update: (patch: Partial<WritingView>) => void;
  aiWords: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Writing view"
        title="Writing view"
        className={`rounded-full p-2.5 transition ${open || view.focus !== "off" ? "bg-surface-strong text-accent" : "text-muted hover:bg-surface-strong hover:text-ink"}`}
      >
        <Eye size={19} />
      </button>
      {open && (
          <div className="bar absolute top-11 right-0 z-40 w-72 rounded-2xl p-3 text-sm shadow-xl">
            <p className="px-1 text-xs font-medium tracking-wide text-muted uppercase">Focus</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-surface-strong p-1">
              {(["off", "sentence", "paragraph"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => update({ focus: f })}
                  className={`rounded-lg py-1.5 capitalize transition ${view.focus === f ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-0.5">
              <Toggle on={view.typewriter} onChange={(v) => update({ typewriter: v })} label="Typewriter" hint="Keeps your line in the middle of the screen." />
              <Toggle on={view.styleCheck} onChange={(v) => update({ styleCheck: v })} label="Style check" hint="Marks filler, clichés, redundancies, and AI-sounding phrases." />
              <Toggle on={view.authorship} onChange={(v) => update({ authorship: v })} label="Show AI text in grey" hint="Turns black once you edit it." />
              <Toggle on={view.quiet} onChange={(v) => update({ quiet: v })} label="Hide toolbars while typing" hint="Move the mouse to bring them back." />
            </div>
            {view.styleCheck && (
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-1 pt-3 text-xs text-muted">
                {(Object.keys(STYLE_KINDS) as (keyof typeof STYLE_KINDS)[]).map((k) => (
                  <span key={k} className="flex items-center gap-2">
                    <span className={`style-flag style-${k} text-ink`}>abc</span> {STYLE_KINDS[k].label}
                  </span>
                ))}
              </div>
            )}
            {aiWords > 0 && editor && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line px-1 pt-3 text-xs text-muted">
                <span>{aiWords} words still written by AI</span>
                <button
                  onClick={() => {
                    claimAllText(editor);
                    setOpen(false);
                  }}
                  className="rounded-full bg-surface-strong px-3 py-1 font-medium text-ink hover:bg-line"
                >
                  Make it all mine
                </button>
              </div>
            )}
          </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-start gap-3 rounded-xl px-1 py-2 text-left hover:bg-surface-strong/60">
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${on ? "bg-ink" : "bg-line"}`}>
        <span className={`size-4 rounded-full bg-bg shadow transition ${on ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

/** The style notes as a list you can tap through (handy on phones, where hover doesn't exist). */
export function StyleNotes({ editor, notes }: { editor: Editor; notes: ReturnType<typeof useDocStats>["notes"] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  if (!notes.length) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        className="rounded-full px-2.5 py-1.5 text-xs text-muted tabular-nums hover:bg-surface-strong hover:text-ink"
      >
        {notes.length} {notes.length === 1 ? "note" : "notes"}
      </button>
      {open && (
          <div className="bar absolute right-0 bottom-12 z-40 max-h-80 w-72 overflow-y-auto rounded-2xl p-1.5 text-sm shadow-xl">
            {notes.map((n, i) => (
              <button
                key={`${n.pos}-${i}`}
                onClick={() => {
                  editor.chain().focus().setTextSelection({ from: n.pos, to: n.pos + n.text.length }).scrollIntoView().run();
                  setOpen(false);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left hover:bg-surface-strong"
              >
                <span className="text-xs text-muted">{STYLE_KINDS[n.kind].label}</span>
                <span className="block font-medium">“{n.text}”</span>
              </button>
            ))}
          </div>
      )}
    </div>
  );
}
