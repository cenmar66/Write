"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Editor, type JSONContent } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

export const IMPORT_ACCEPT =
  ".txt,.md,.markdown,.docx,.html,.htm,text/plain,text/markdown,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Reads a file's text for use as reference material (the home screen's + button). */
export async function readFileText(file: File): Promise<string> {
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  if (/\.html?$/i.test(file.name)) {
    return new DOMParser().parseFromString(await file.text(), "text/html").body.textContent ?? "";
  }
  if (/\.(txt|md|markdown)$/i.test(file.name)) return file.text();
  throw new Error(`Can't read ${file.name}. Use .txt, .md, .docx, or .html.`);
}

/** Converts a file into the editor's format, keeping headings, lists, bold, and links. */
async function convert(file: File) {
  const editor = new Editor({ extensions: [StarterKit, Markdown] });
  try {
    if (/\.docx$/i.test(file.name)) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      editor.commands.setContent(value);
    } else if (/\.html?$/i.test(file.name)) {
      editor.commands.setContent(await file.text());
    } else if (/\.(md|markdown)$/i.test(file.name)) {
      editor.commands.setContent(await file.text(), { contentType: "markdown" });
    } else if (/\.txt$/i.test(file.name)) {
      const paragraphs = (await file.text()).replace(/\r\n/g, "\n").split(/\n{2,}/).filter((p) => p.trim());
      editor.commands.setContent({
        type: "doc",
        content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p.trim() }] })),
      });
    } else {
      return null;
    }
    // Use the first heading as the title when there is one.
    const json = editor.getJSON();
    let title = file.name.replace(/\.[^.]+$/, "");
    const first = json.content?.[0];
    if (first?.type === "heading" && first.attrs?.level === 1) {
      title = (first.content ?? []).map((n: JSONContent) => n.text ?? "").join("").trim() || title;
      json.content = json.content!.slice(1);
      editor.commands.setContent(json);
    }
    const text = editor.getText({ blockSeparator: "\n\n" });
    return {
      title,
      content: editor.getJSON(),
      content_text: text,
      word_count: text.trim() ? text.trim().split(/\s+/).length : 0,
    };
  } finally {
    editor.destroy();
  }
}

/** Turns files into documents. Returns the new ids and any files it couldn't read. */
export async function importFiles(
  supabase: SupabaseClient,
  files: File[],
  opts: { folderId?: string | null } = {},
): Promise<{ ids: string[]; skipped: string[] }> {
  const rows = [];
  const skipped: string[] = [];
  for (const file of files) {
    try {
      const row = await convert(file);
      if (row) rows.push({ ...row, folder_id: opts.folderId ?? null });
      else skipped.push(file.name);
    } catch {
      skipped.push(file.name);
    }
  }
  if (!rows.length) return { ids: [], skipped };
  const { data, error } = await supabase.from("documents").insert(rows).select("id");
  if (error) throw new Error("Couldn't save the imported files. Check your connection and try again.");
  return { ids: (data ?? []).map((d) => d.id as string), skipped };
}
