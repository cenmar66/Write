import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findStyleIssues, sentenceRange, type StyleIssue } from "./style-check";

export type FocusMode = "off" | "sentence" | "paragraph";
export type WritingModeState = { focus: FocusMode; typewriter: boolean; styleCheck: boolean };

/** Transactions with this meta keep their AI marks (AI inserts, version restores). */
export const KEEP_AUTHORSHIP = "keepAuthorship";
const REFRESH = "writingModesRefresh";

export const styleKey = new PluginKey<{ set: DecorationSet; issues: (StyleIssue & { pos: number })[] }>("styleCheck");

declare module "@tiptap/core" {
  interface Storage {
    writingModes: WritingModeState;
  }
}

/** Change a mode and redraw. */
export function setWritingModes(editor: Editor, next: WritingModeState) {
  Object.assign(editor.storage.writingModes, next);
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(REFRESH, true).setMeta("addToHistory", false));
}

function buildStyle(doc: PMNode, on: boolean) {
  const issues: (StyleIssue & { pos: number })[] = [];
  if (!on) return { set: DecorationSet.empty, issues };
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.name === "codeBlock") return false;
    const start = pos + 1;
    const text = doc.textBetween(start, pos + node.nodeSize - 1, "\n", "\n");
    for (const issue of findStyleIssues(text)) {
      issues.push({ ...issue, pos: start + issue.from });
      decos.push(
        Decoration.inline(start + issue.from, start + issue.to, {
          class: `style-flag style-${issue.kind}`,
          title: issue.note,
        }),
      );
    }
    return false;
  });
  return { set: DecorationSet.create(doc, decos), issues };
}

/** Ranges of new content a transaction inserted, in final positions. */
function insertedRanges(tr: Transaction) {
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    map.forEach((_a, _b, from, to) => {
      if (to <= from) return;
      const rest = tr.mapping.slice(i + 1);
      ranges.push([rest.map(from, -1), rest.map(to, 1)]);
    });
  });
  return ranges;
}

/** iA Writer–style writing modes: focus, typewriter, style check, and authorship. */
export const WritingModes = Extension.create({
  name: "writingModes",

  addStorage(): WritingModeState {
    return { focus: "off", typewriter: false, styleCheck: false };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const modes = () => editor.storage.writingModes;

    // Focus: highlight the sentence or paragraph you're in; CSS fades the rest.
    const focus = new Plugin({
      key: new PluginKey("focusMode"),
      props: {
        decorations(state) {
          const mode = modes().focus;
          const { $head } = state.selection;
          if (mode === "off" || !$head.parent.isTextblock || $head.depth < 1) return null;
          if (mode === "paragraph") {
            return DecorationSet.create(state.doc, [Decoration.node($head.before(), $head.after(), { class: "is-focused" })]);
          }
          const start = $head.start();
          const text = state.doc.textBetween(start, $head.end(), "\n", "\n");
          const [a, b] = sentenceRange(text, $head.parentOffset);
          if (b <= a) return null;
          return DecorationSet.create(state.doc, [Decoration.inline(start + a, start + b, { class: "is-focused" })]);
        },
      },
    });

    // Style check: dotted underlines with a note on hover.
    const style = new Plugin({
      key: styleKey,
      state: {
        init: (_, state) => buildStyle(state.doc, modes().styleCheck),
        apply: (tr, old, _o, state) => (tr.docChanged || tr.getMeta(REFRESH) ? buildStyle(state.doc, modes().styleCheck) : old),
      },
      props: { decorations: (state) => styleKey.getState(state)?.set },
    });

    // Typewriter: keep the line you're on near the middle of the screen.
    const typewriter = new Plugin({
      key: new PluginKey("typewriter"),
      view: () => ({
        update(view, prev) {
          if (!modes().typewriter || !view.hasFocus()) return;
          if (prev.doc.eq(view.state.doc) && prev.selection.eq(view.state.selection)) return;
          const caret = view.coordsAtPos(view.state.selection.head);
          const delta = caret.top - window.innerHeight * 0.42;
          if (Math.abs(delta) > 6) window.scrollBy({ top: delta, behavior: "smooth" });
        },
      }),
    });

    // Authorship: whatever you type is yours, so drop the AI mark from your edits.
    const authorship = new Plugin({
      key: new PluginKey("authorship"),
      appendTransaction(trs, _old, state) {
        const type = state.schema.marks.aiText;
        if (!type) return null;
        let ranges: [number, number][] = [];
        for (const tr of trs) {
          ranges = ranges.map(([a, b]) => [tr.mapping.map(a, -1), tr.mapping.map(b, 1)]);
          if (!tr.docChanged || tr.getMeta(KEEP_AUTHORSHIP) || tr.getMeta("history$")) continue;
          ranges.push(...insertedRanges(tr));
        }
        const fix = ranges.filter(([a, b]) => b > a && state.doc.rangeHasMark(a, b, type));
        if (!fix.length) return null;
        const out = state.tr;
        fix.forEach(([a, b]) => out.removeMark(a, b, type));
        return out.setMeta(KEEP_AUTHORSHIP, true);
      },
    });

    return [focus, style, typewriter, authorship];
  },
});
