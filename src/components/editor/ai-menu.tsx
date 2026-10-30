"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  ChevronLeft,
  Heading2,
  Italic,
  List,
  Minimize2,
  PenLine,
  Maximize2,
  Quote,
  SpellCheck,
  Sparkles,
  Baby,
  Palette,
  Fingerprint,
} from "lucide-react";
import { useState } from "react";
import { EDIT_ACTIONS, TONES, type EditAction, type Tone } from "@/lib/ai/actions";

const ACTION_ICONS = {
  rewrite: PenLine,
  shorten: Minimize2,
  expand: Maximize2,
  grammar: SpellCheck,
  simplify: Baby,
  humanize: Fingerprint,
} as const;

/** Appears when you highlight text: formatting plus the AI actions. */
export function AiBubbleMenu({
  editor,
  onAction,
}: {
  editor: Editor;
  onAction: (action: EditAction, tone?: Tone) => void;
}) {
  const [mode, setMode] = useState<"format" | "ai" | "tone">("format");

  const run = (action: EditAction, tone?: Tone) => {
    setMode("format");
    onAction(action, tone);
  };

  return (
    <BubbleMenu
      editor={editor}
      // Below the selection so it doesn't fight the phone's own copy/paste menu.
      options={{ placement: "bottom", offset: 10 }}
      shouldShow={({ editor, state }) => !state.selection.empty && editor.isEditable}
      className="bar z-30 rounded-2xl p-1 shadow-xl"
    >
      {mode === "format" && (
        <div className="flex items-center gap-0.5">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode("ai")}
            className="bg-gradient-brand flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white"
          >
            <Sparkles size={15} /> Ask AI
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          <FormatButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={16} />
          </FormatButton>
          <FormatButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={16} />
          </FormatButton>
          <FormatButton
            label="Heading"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 size={16} />
          </FormatButton>
          <FormatButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={16} />
          </FormatButton>
          <FormatButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote size={16} />
          </FormatButton>
        </div>
      )}

      {mode === "ai" && (
        <div className="w-72 py-1">
          {(Object.keys(ACTION_ICONS) as (keyof typeof ACTION_ICONS)[]).map((key) => {
            const Icon = ACTION_ICONS[key];
            return (
              <MenuRow key={key} onClick={() => run(key)} icon={<Icon size={16} />} hint={EDIT_ACTIONS[key].hint}>
                {EDIT_ACTIONS[key].label}
              </MenuRow>
            );
          })}
          <MenuRow onClick={() => setMode("tone")} icon={<Palette size={16} />} hint="Pick a vibe">
            Change tone
          </MenuRow>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode("format")}
            className="mt-1 flex w-full items-center gap-1 px-3 py-1.5 text-xs text-muted hover:text-ink"
          >
            <ChevronLeft size={13} /> Back
          </button>
        </div>
      )}

      {mode === "tone" && (
        <div className="w-64 p-2">
          <p className="px-1 pb-2 text-xs text-muted">Rewrite it to sound…</p>
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button
                key={t}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run("tone", t)}
                className="rounded-full bg-surface-strong px-3 py-1.5 text-sm transition hover:bg-accent hover:text-white"
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMode("ai")}
            className="mt-2 flex items-center gap-1 px-1 text-xs text-muted hover:text-ink"
          >
            <ChevronLeft size={13} /> Back
          </button>
        </div>
      )}
    </BubbleMenu>
  );
}

function FormatButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-xl p-2 transition ${active ? "bg-surface-strong text-accent" : "text-muted hover:bg-surface-strong hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function MenuRow({
  onClick,
  icon,
  hint,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-surface-strong"
    >
      <span className="text-accent">{icon}</span>
      <span className="flex-1 text-sm">{children}</span>
      <span className="text-xs whitespace-nowrap text-muted">{hint}</span>
    </button>
  );
}
