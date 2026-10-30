"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { type Editor, EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  CloudOff,
  Download,
  FileDown,
  FileText,
  FileType,
  History,
  Loader2,
  Megaphone,
  MessageCircle,
  Newspaper,
  Mic,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EDIT_ACTIONS, type EditAction, type Tone } from "@/lib/ai/actions";
import type { DictationResult } from "@/lib/ai/dictation";
import { type Brief, briefKey, type Doc, type Version } from "@/lib/docs";
import { AiText } from "@/lib/editor/ai-text";
import { KEEP_AUTHORSHIP, WritingModes } from "@/lib/editor/writing-modes";
import { streamFetch } from "@/lib/stream";
import { createClient } from "@/lib/supabase/client";
import { ModelChip } from "../model-picker";
import { DictationPanel, type DictationPanelHandle } from "../dictation/dictation-panel";
import { AiBubbleMenu } from "./ai-menu";
import { ChatPanel } from "./chat-panel";
import { copyForLinkedInArticle, exportDocx, exportMarkdown, exportPdf } from "./export";
import { HistoryPanel } from "./history-panel";
import { SubstackPanel } from "./substack-panel";
import { type Suggestion, SuggestionCard } from "./suggestion-card";
import { StyleNotes, useDismiss, useDocStats, useQuietChrome, useWritingView, WritingViewMenu } from "./writing-view";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";
type AiRun = { action: EditAction; tone?: Tone; from: number; to: number; abort: AbortController };

const hasContent = (c: JSONContent) => Array.isArray(c?.content) && c.content.length > 0;
/** Inserts AI-written Markdown and marks it as AI text, as one undo step. */
function insertAi(editor: Editor, at: number | { from: number; to: number }, markdown: string, focusEnd = false) {
  const from = typeof at === "number" ? at : at.from;
  const to = typeof at === "number" ? at : at.to;
  let size = 0;
  const chain = focusEnd ? editor.chain().focus("end") : editor.chain().focus();
  return chain
    .command(({ tr }) => {
      size = tr.doc.content.size;
      return true;
    })
    .insertContentAt(at, markdown, { contentType: "markdown" })
    .command(({ tr }) => {
      const type = tr.doc.type.schema.marks.aiText;
      const end = Math.min(tr.doc.content.size, to + (tr.doc.content.size - size));
      if (type && end > from) tr.addMark(from, end, type.create());
      tr.setMeta(KEEP_AUTHORSHIP, true);
      return true;
    })
    .run();
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function DocumentEditor({ id, autoDictate = false }: { id: string; autoDictate?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [doc, setDoc] = useState<Doc | null | "missing">(null);

  useEffect(() => {
    supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setDoc((data as Doc) ?? "missing"));
  }, [supabase, id]);

  if (doc === null) return <EditorSkeleton />;
  if (doc === "missing") {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
        <p className="font-display text-3xl">This document doesn’t exist.</p>
        <Link href="/docs" className="mt-3 text-accent hover:underline">
          Back to documents
        </Link>
      </div>
    );
  }
  return <LoadedEditor doc={doc} supabase={supabase} autoDictate={autoDictate} />;
}

function LoadedEditor({ doc, supabase, autoDictate }: { doc: Doc; supabase: SupabaseClient; autoDictate: boolean }) {
  const [title, setTitle] = useState(doc.title);
  const titleRef = useRef(doc.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [panel, setPanel] = useState<null | "chat" | "history" | "substack">(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: boolean } | null>(null);
  const router = useRouter();
  const aiRun = useRef<AiRun | null>(null);
  // Dictation: where to insert, and what was dictated last (for "rewrite that").
  const [dictating, setDictating] = useState<null | { startNow: boolean }>(autoDictate ? { startNow: false } : null);
  const dictationPanel = useRef<DictationPanelHandle>(null);
  const dictationTarget = useRef<{ from: number; to: number } | null>(null);
  const lastDictated = useRef<{ from: number; to: number } | null>(null);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Latest versions of callbacks, for handlers registered once (editor, timers).
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const startRef = useRef<(action: EditAction) => void>(() => {});

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setStatus("unsaved");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRef.current(), 900);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: "Start writing… or press ⌘J and let AI keep going." }),
      CharacterCount,
      Markdown,
      AiText,
      WritingModes,
    ],
    content: hasContent(doc.content) ? doc.content : undefined,
    editorProps: {
      attributes: { class: "tiptap-doc", spellcheck: "true" },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
          event.preventDefault();
          startRef.current("continue");
          return true;
        }
        return false;
      },
    },
    onUpdate: scheduleSave,
  });

  const plainText = useCallback(() => editor?.getText({ blockSeparator: "\n\n" }) ?? "", [editor]);

  const save = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (!editor || !dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    const { error } = await supabase
      .from("documents")
      .update({
        title: titleRef.current,
        content: editor.getJSON(),
        content_text: plainText(),
        word_count: editor.storage.characterCount.words(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    if (error) {
      dirty.current = true;
      setStatus("error");
      saveTimer.current = setTimeout(() => saveRef.current(), 5000);
    } else {
      setStatus(dirty.current ? "unsaved" : "saved");
    }
  }, [editor, supabase, doc.id, plainText]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Save right away when you switch apps or leave the page.
  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && saveRef.current();
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      saveRef.current();
    };
  }, []);

  const snapshot = useCallback(
    async (label: string) => {
      if (!editor) return;
      await supabase.from("document_versions").insert({
        document_id: doc.id,
        label,
        title: titleRef.current,
        content: editor.getJSON(),
        content_text: plainText(),
      });
    },
    [editor, supabase, doc.id, plainText],
  );

  // A snapshot each time you open a doc (at most once an hour).
  useEffect(() => {
    if (!editor || !doc.content_text) return;
    supabase
      .from("document_versions")
      .select("created_at")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const last = data?.[0]?.created_at;
        if (!last || Date.now() - new Date(last).getTime() > 3_600_000) snapshot("Opened");
      });
  }, [editor, supabase, doc.id, doc.content_text, snapshot]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // A brief from the home screen: write the first draft straight into the page.
  const [drafting, setDrafting] = useState<AbortController | null>(null);
  const briefRan = useRef(false);
  useEffect(() => {
    if (!editor || briefRan.current) return;
    briefRan.current = true;
    let brief: Brief | null = null;
    try {
      const raw = sessionStorage.getItem(briefKey(doc.id));
      sessionStorage.removeItem(briefKey(doc.id));
      brief = raw ? (JSON.parse(raw) as Brief) : null;
    } catch {}
    if (!brief) return;
    const abort = new AbortController();
    queueMicrotask(() => setDrafting(abort));
    let last = 0;
    const show = (markdown: string, final = false) => {
      const now = Date.now();
      if (!final && now - last < 120) return;
      last = now;
      const match = markdown.match(/^\s*#\s+(.+)\n?/);
      const body = match ? markdown.slice(match[0].length) : markdown;
      if (match) {
        titleRef.current = match[1].trim();
        setTitle(match[1].trim());
      }
      editor.commands.setContent(body, { contentType: "markdown", emitUpdate: false });
    };
    streamFetch(
      "/api/ai/draft",
      { brief: brief.brief, sources: brief.sources, documentId: doc.id, styleId: brief.styleId ?? undefined },
      (soFar) => show(soFar),
      abort.signal,
    )
      .then((final) => {
        show(final, true);
        editor
          .chain()
          .command(({ tr }) => {
            const type = tr.doc.type.schema.marks.aiText;
            if (type) tr.addMark(0, tr.doc.content.size, type.create());
            tr.setMeta(KEEP_AUTHORSHIP, true).setMeta("addToHistory", false);
            return true;
          })
          .run();
      })
      .catch((e) => {
        if (!abort.signal.aborted) setToast({ message: (e as Error).message });
      })
      .finally(() => {
        setDrafting(null);
        scheduleSave();
      });
  }, [editor, doc.id, scheduleSave]);

  const start = useCallback(
    async (action: EditAction, tone?: Tone, range?: { from: number; to: number }) => {
      if (!editor) return;
      const sel = range ?? editor.state.selection;
      let text: string;
      let from = sel.from;
      const to = sel.to;
      if (action === "continue") {
        from = to;
        text = editor.state.doc.textBetween(0, to, "\n\n");
        if (!text.trim()) {
          setToast({ message: "Write a sentence or two first, then I'll keep going." });
          return;
        }
      } else {
        if (from === to) return;
        text = editor.state.doc.textBetween(from, to, "\n\n");
      }

      aiRun.current?.abort.abort();
      const abort = new AbortController();
      aiRun.current = { action, tone, from, to, abort };
      setSuggestion({
        label: action === "tone" ? `Tone: ${tone}` : EDIT_ACTIONS[action].label,
        text: "",
        status: "streaming",
        canReplace: action !== "continue",
      });

      try {
        const result = await streamFetch(
          "/api/ai/edit",
          { action, tone, text, document: editor.getMarkdown(), documentId: doc.id },
          (soFar) => setSuggestion((s) => s && { ...s, text: soFar }),
          abort.signal,
        );
        setSuggestion((s) => s && { ...s, text: result.trim(), status: "done" });
      } catch (e) {
        if (abort.signal.aborted) {
          setSuggestion((s) => s && { ...s, text: s.text.trim(), status: s.text.trim() ? "done" : "error" });
        } else {
          setSuggestion((s) => s && { ...s, text: (e as Error).message, status: "error" });
        }
      }
    },
    [editor, doc.id],
  );

  useEffect(() => {
    startRef.current = (action) => start(action);
  }, [start]);

  const openDictation = useCallback(
    (startNow: boolean) => {
      if (editor) dictationTarget.current = { from: editor.state.selection.from, to: editor.state.selection.to };
      setDictating({ startNow });
    },
    [editor],
  );

  // ⌘/Ctrl + Shift + Space: start dictating, press again to finish.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        if (dictating) dictationPanel.current?.toggle();
        else openDictation(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dictating, openDictation]);

  function insertDictation(markdown: string) {
    if (!editor || !markdown.trim()) return;
    const size = editor.state.doc.content.size;
    const target = dictationTarget.current ?? { from: editor.state.selection.from, to: editor.state.selection.to };
    const from = Math.min(target.from, size);
    const to = Math.min(target.to, size);
    // Add a space when continuing a sentence mid-paragraph.
    const before = from > 1 ? editor.state.doc.textBetween(from - 1, from, "\n") : "";
    const needsSpace = before !== "" && !/\s/.test(before) && !markdown.includes("\n");
    editor.chain().focus().insertContentAt({ from, to }, (needsSpace ? " " : "") + markdown, { contentType: "markdown" }).run();
    lastDictated.current = { from, to: editor.state.selection.to };
  }

  async function runVoiceCommand(result: Extract<DictationResult, { kind: "command" }>) {
    if (!editor) return;
    const size = editor.state.doc.content.size;
    const sel = dictationTarget.current;
    const last = lastDictated.current;
    let range: { from: number; to: number };
    if (sel && sel.from !== sel.to) range = sel;
    else if (last && last.to <= size) range = last;
    else {
      // Fall back to the paragraph the cursor is in.
      const $pos = editor.state.doc.resolve(Math.min(sel?.from ?? editor.state.selection.from, size));
      range = $pos.depth > 0 ? { from: $pos.start(1), to: $pos.end(1) } : { from: 0, to: size };
    }
    const chain = () => editor.chain().focus().setTextSelection(range);
    switch (result.command) {
      case "bullets":
        chain().toggleBulletList().run();
        break;
      case "numbered":
        chain().toggleOrderedList().run();
        break;
      case "heading":
        chain().toggleHeading({ level: 2 }).run();
        break;
      case "delete":
        await snapshot("Before voice delete");
        editor.chain().focus().deleteRange(range).run();
        lastDictated.current = null;
        break;
      default:
        start(result.command, result.tone, range);
        return;
    }
    setToast({ message: `Voice command: ${result.command === "numbered" ? "numbered list" : result.command}`, undo: true });
  }

  async function apply(mode: "replace" | "below") {
    const run = aiRun.current;
    if (!editor || !run || !suggestion) return;
    await snapshot(`Before AI: ${suggestion.label}`);
    if (mode === "replace") {
      insertAi(editor, { from: run.from, to: run.to }, suggestion.text);
    } else {
      // Drop it in as new paragraphs right after the block you were in.
      const $pos = editor.state.doc.resolve(Math.min(run.to, editor.state.doc.content.size));
      const after = $pos.depth > 0 ? $pos.after(1) : run.to;
      insertAi(editor, after, suggestion.text);
    }
    aiRun.current = null;
    setSuggestion(null);
    setToast({ message: "Done. Changed your mind?", undo: true });
  }

  function discard() {
    aiRun.current?.abort.abort();
    aiRun.current = null;
    setSuggestion(null);
  }

  async function insertFromChat(markdown: string) {
    if (!editor) return;
    await snapshot("Before inserting from chat");
    insertAi(editor, editor.state.doc.content.size, markdown, true);
    setToast({ message: "Added to the end of your doc.", undo: true });
  }

  async function restore(v: Version) {
    if (!editor) return;
    await snapshot("Before restoring");
    editor.chain().setMeta(KEEP_AUTHORSHIP, true).setContent(v.content).run();
    titleRef.current = v.title;
    setTitle(v.title);
    scheduleSave();
    setToast({ message: "Version restored." });
  }

  function onTitle(value: string) {
    const clean = value.replace(/\n/g, " ");
    setTitle(clean);
    titleRef.current = clean;
    scheduleSave();
  }

  async function runExport(kind: "md" | "docx" | "pdf" | "linkedin") {
    setExportOpen(false);
    if (!editor) return;
    if (kind === "linkedin") {
      const rich = await copyForLinkedInArticle(editor.getHTML(), plainText());
      setToast({
        message: rich
          ? "Copied with formatting. In LinkedIn, type the title, then paste into the article body."
          : "Copied as plain text (this browser blocked formatting).",
      });
      return;
    }
    if (kind === "md") exportMarkdown(titleRef.current, editor.getMarkdown());
    if (kind === "docx") await exportDocx(titleRef.current, editor.getJSON());
    if (kind === "pdf") exportPdf();
  }

  const exportRef = useDismiss<HTMLDivElement>(exportOpen, () => setExportOpen(false));
  const [view, updateView] = useWritingView(editor);
  useQuietChrome(view.quiet);
  const stats = useDocStats(editor, doc.word_count);
  const shortcut = isMac() ? "⌘J" : "Ctrl+J";

  return (
    <div className="-mt-2">
      {/* Top bar */}
      <div data-chrome className="sticky top-0 z-30 -mx-5 flex items-center gap-1 bg-[var(--bar)] px-3 py-2 backdrop-blur-xl print:hidden md:-mx-10 md:px-6">
        <Link href="/" aria-label="Back to home" className="rounded-full p-2 text-muted hover:bg-surface-strong hover:text-ink">
          <ArrowLeft size={20} />
        </Link>
        <SaveBadge status={status} />
        <div className="ml-auto flex items-center gap-1">
          <WritingViewMenu editor={editor} view={view} update={updateView} aiWords={stats.aiWords} />
          <IconButton label="Chat" active={panel === "chat"} onClick={() => setPanel(panel === "chat" ? null : "chat")}>
            <MessageCircle size={19} />
          </IconButton>
          <IconButton
            label="Turn into social posts"
            onClick={async () => {
              await saveRef.current();
              router.push(`/posts/repurpose?doc=${doc.id}&auto=1`);
            }}
          >
            <Megaphone size={19} />
          </IconButton>
          <IconButton label="Send to Substack" active={panel === "substack"} onClick={() => setPanel(panel === "substack" ? null : "substack")}>
            <Newspaper size={19} />
          </IconButton>
          <IconButton label="History" active={panel === "history"} onClick={() => setPanel(panel === "history" ? null : "history")}>
            <History size={19} />
          </IconButton>
          <div ref={exportRef} className="relative">
            <IconButton label="Export or copy" active={exportOpen} onClick={() => setExportOpen(!exportOpen)}>
              <Download size={19} />
            </IconButton>
            {exportOpen && (
              <>
                <div className="bar absolute top-11 right-0 z-40 w-64 rounded-2xl p-1.5 text-sm shadow-xl">
                  <ExportItem icon={<ClipboardCopy size={16} />} onClick={() => runExport("linkedin")}>
                    Copy for LinkedIn article
                  </ExportItem>
                  <div className="my-1 h-px bg-line" />
                  <ExportItem icon={<FileType size={16} />} onClick={() => runExport("docx")}>
                    Word (.docx)
                  </ExportItem>
                  <ExportItem icon={<FileDown size={16} />} onClick={() => runExport("pdf")}>
                    PDF
                  </ExportItem>
                  <ExportItem icon={<FileText size={16} />} onClick={() => runExport("md")}>
                    Markdown (.md)
                  </ExportItem>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Writing surface */}
      <article
        className={`mx-auto max-w-2xl pt-8 pb-48 md:pt-14 ${view.focus !== "off" ? "writing-focus" : ""} ${view.authorship ? "show-authorship" : ""}`}
        style={{ paddingBottom: `calc(var(--bottom-panel, 0px) + ${view.typewriter ? "55dvh" : "12rem"})` }}
      >
        <textarea
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("start");
            }
          }}
          rows={1}
          placeholder="Untitled"
          aria-label="Title"
          className="w-full resize-none bg-transparent font-display text-4xl leading-tight tracking-tight outline-none [field-sizing:content] placeholder:text-muted/50 sm:text-5xl"
        />
        <EditorContent editor={editor} className="mt-6" />
      </article>

      {editor && !suggestion && <AiBubbleMenu editor={editor} onAction={(a, t) => start(a, t)} />}

      {drafting && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden md:left-64">
          <div className="bar flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-sm shadow-lg">
            <Loader2 size={16} className="animate-spin text-accent" /> Writing your draft…
            <button onClick={() => drafting.abort()} className="rounded-full bg-surface-strong px-3 py-1.5 font-medium hover:text-red-700 dark:hover:text-red-400">
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Bottom dock */}
      {!suggestion && !dictating && !drafting && panel !== "chat" && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden md:left-64">
          <div data-chrome className="bar flex items-center gap-1 rounded-full p-1.5 shadow-lg">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openDictation(true)}
              aria-label="Dictate"
              title={`Dictate (${isMac() ? "⌘" : "Ctrl"}+Shift+Space)`}
              className="grid size-10 place-items-center rounded-full bg-ink text-bg transition hover:scale-105"
            >
              <Mic size={18} />
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => start("continue")}
              className="bg-gradient-brand flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white"
            >
              <Sparkles size={16} /> <span className="max-[380px]:hidden">Continue writing</span>
              <kbd className="hidden rounded bg-white/20 px-1.5 text-[11px] md:inline">{shortcut}</kbd>
            </button>
            <ModelChip documentId={doc.id} styleId={doc.style_id ?? null} />
            {editor && view.styleCheck && <StyleNotes editor={editor} notes={stats.notes} />}
            <span className="pr-3 pl-1 text-xs text-muted tabular-nums" title={`About ${stats.minutes} min to read`}>
              {stats.picked ? `${stats.picked} of ${stats.words}` : stats.words} words
              <span className="max-sm:hidden"> · {stats.minutes} min</span>
            </span>
          </div>
        </div>
      )}

      {dictating && (
        <DictationPanel
          ref={dictationPanel}
          startNow={dictating.startNow}
          onInsert={insertDictation}
          onCommand={runVoiceCommand}
          onClose={() => setDictating(null)}
        />
      )}

      {suggestion && (
        <SuggestionCard
          suggestion={suggestion}
          onAccept={() => apply("replace")}
          onInsertBelow={() => apply("below")}
          onRetry={() => {
            const run = aiRun.current;
            if (run) start(run.action, run.tone, { from: run.from, to: run.to });
          }}
          onDiscard={discard}
          onStop={() => aiRun.current?.abort.abort()}
        />
      )}

      {toast && !suggestion && !dictating && panel !== "chat" && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 print:hidden md:left-64">
          <div className="flex items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-4 text-sm text-bg shadow-xl animate-rise">
            {toast.message}
            {toast.undo && (
              <button
                onClick={() => {
                  editor?.commands.undo();
                  setToast(null);
                }}
                className="rounded-full bg-white/15 px-3 py-1 font-medium"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}

      {panel === "chat" && (
        <ChatPanel
          supabase={supabase}
          documentId={doc.id}
          getDocument={() => ({ title: titleRef.current, markdown: editor?.getMarkdown() ?? "" })}
          onInsert={insertFromChat}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "substack" && editor && (
        <SubstackPanel supabase={supabase} documentId={doc.id} editor={editor} save={() => saveRef.current()} onClose={() => setPanel(null)} />
      )}
      {panel === "history" && (
        <HistoryPanel
          supabase={supabase}
          documentId={doc.id}
          onSaveVersion={() => snapshot("Saved by you")}
          onRestore={restore}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  const map = {
    saved: { icon: <Check size={14} />, text: "Saved" },
    saving: { icon: <Loader2 size={14} className="animate-spin" />, text: "Saving…" },
    unsaved: { icon: <span className="size-1.5 rounded-full bg-accent-3" />, text: "Editing" },
    error: { icon: <CloudOff size={14} />, text: "Offline, retrying…" },
  }[status];
  return (
    <span className={`flex items-center gap-1.5 px-2 text-xs ${status === "error" ? "text-red-700 dark:text-red-400" : "text-muted"}`}>
      {map.icon}
      {map.text}
    </span>
  );
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-full p-2.5 transition ${active ? "bg-surface-strong text-accent" : "text-muted hover:bg-surface-strong hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function ExportItem({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-strong">
      <span className="text-accent">{icon}</span>
      {children}
    </button>
  );
}

export function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse pt-20">
      <div className="h-12 w-2/3 rounded-xl bg-surface-strong" />
      <div className="mt-8 space-y-3">
        <div className="h-4 rounded bg-surface-strong" />
        <div className="h-4 w-11/12 rounded bg-surface-strong" />
        <div className="h-4 w-4/5 rounded bg-surface-strong" />
      </div>
    </div>
  );
}
