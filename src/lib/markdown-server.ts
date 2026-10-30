import { Editor, type JSONContent } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { AiText } from "./editor/ai-text";

// The editor must get its content up front on the server: starting empty makes it
// parse HTML, which needs a browser.
const EMPTY: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function withEditor<T>(content: JSONContent | string, fn: (editor: Editor) => T): T {
  const editor =
    typeof content === "string"
      ? new Editor({ extensions: [StarterKit, Markdown, AiText], content, contentType: "markdown" })
      : new Editor({ extensions: [StarterKit, Markdown, AiText], content });
  try {
    return fn(editor);
  } finally {
    editor.destroy();
  }
}

/** Markdown in, everything a document row needs out. */
export function markdownToDoc(markdown: string) {
  return withEditor(markdown.trim() ? markdown : EMPTY, (editor) => {
    const text = editor.getText({ blockSeparator: "\n\n" });
    return {
      content: editor.getJSON(),
      content_text: text,
      word_count: text.trim() ? text.trim().split(/\s+/).length : 0,
    };
  });
}

/** A stored document as Markdown. */
export function docToMarkdown(content: JSONContent | null | undefined, fallbackText = ""): string {
  if (!content?.content?.length) return fallbackText;
  try {
    return withEditor(content, (editor) => editor.getMarkdown());
  } catch (error) {
    console.error("Markdown conversion failed", error);
    return fallbackText;
  }
}
