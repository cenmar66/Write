"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Editor, type JSONContent } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

// No file-type filter on purpose: phones and Macs often grey out .md and other text
// files they don't recognize. Each file is checked after you pick it instead.
export const IMPORT_ACCEPT: string | undefined = undefined;

/** Reads any text-based file as plain text: .txt, .md, .rtf, .html, .csv, .json, .docx, and more. */
export async function readFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  if (name.endsWith(".pdf")) throw new Error(`${file.name}: PDFs can't be read yet. Copy and paste the text instead.`);
  if (/\.(doc|pages|odt|zip|png|jpe?g|gif|webp|heic|mp3|mp4|mov|m4a)$/.test(name)) {
    throw new Error(`${file.name} isn't a text file.`);
  }
  const raw = await file.text();
  // Binary files decode with null bytes or lots of "unknown character" marks.
  const bad = (raw.slice(0, 4000).match(/\u0000|\uFFFD/g) ?? []).length;
  if (bad > 5) throw new Error(`${file.name} isn't a text file.`);
  if (/\.html?$/.test(name)) return new DOMParser().parseFromString(raw, "text/html").body.textContent ?? "";
  if (name.endsWith(".rtf")) return rtfToText(raw);
  return raw;
}

/** Rough RTF to plain text: drops formatting codes, keeps the words. */
function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info)([^{}]|\{[^{}]*\})*\}/g, "")
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    } else {
      // Any other text file (.txt, .rtf, .csv…): one paragraph per blank-line-separated block.
      const paragraphs = (await readFileText(file)).replace(/\r\n/g, "\n").split(/\n{2,}/).filter((p) => p.trim());
      editor.commands.setContent({
        type: "doc",
        content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p.trim() }] })),
      });
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
