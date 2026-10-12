import type { JSONContent } from "@tiptap/react";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title: string) {
  return (title || "Untitled").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "Untitled";
}

export function exportMarkdown(title: string, markdown: string) {
  const body = title ? `# ${title}\n\n${markdown}` : markdown;
  download(new Blob([body], { type: "text/markdown;charset=utf-8" }), `${safeFilename(title)}.md`);
}

/** Uses the browser's print dialog, where you pick "Save as PDF". */
export function exportPdf() {
  window.print();
}

// ---- Word (.docx) ----

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

type Inline = TextRun | ExternalHyperlink;

function inlines(nodes: JSONContent[] = [], extra: { italics?: boolean } = {}): Inline[] {
  return nodes.flatMap((n): Inline[] => {
    if (n.type === "hardBreak") return [new TextRun({ text: "", break: 1 })];
    if (n.type !== "text" || !n.text) return [];
    const marks = new Set((n.marks ?? []).map((m) => m.type));
    const run = new TextRun({
      text: n.text,
      bold: marks.has("bold"),
      italics: marks.has("italic") || extra.italics,
      underline: marks.has("underline") ? {} : undefined,
      strike: marks.has("strike"),
      font: marks.has("code") ? "Courier New" : undefined,
      style: marks.has("link") ? "Hyperlink" : undefined,
    });
    const link = n.marks?.find((m) => m.type === "link");
    return link?.attrs?.href ? [new ExternalHyperlink({ link: link.attrs.href, children: [run] })] : [run];
  });
}

function blocks(nodes: JSONContent[] = [], ctx: { level?: number; list?: "bullet" | "ordered"; quote?: boolean } = {}): Paragraph[] {
  return nodes.flatMap((n): Paragraph[] => {
    switch (n.type) {
      case "heading":
        return [new Paragraph({ heading: HEADINGS[(n.attrs?.level ?? 1) - 1] ?? HeadingLevel.HEADING_4, children: inlines(n.content) })];
      case "paragraph":
        return [
          new Paragraph({
            children: inlines(n.content, { italics: ctx.quote }),
            indent: ctx.quote ? { left: 720 } : undefined,
            ...(ctx.list === "bullet" ? { bullet: { level: ctx.level ?? 0 } } : {}),
            ...(ctx.list === "ordered" ? { numbering: { reference: "ordered", level: ctx.level ?? 0 } } : {}),
            spacing: { after: 160 },
          }),
        ];
      case "bulletList":
      case "orderedList": {
        const list = n.type === "bulletList" ? "bullet" : "ordered";
        const level = ctx.list ? (ctx.level ?? 0) + 1 : 0;
        return (n.content ?? []).flatMap((item) =>
          (item.content ?? []).flatMap((child, i) =>
            // The item's first paragraph carries the bullet; nested lists indent one level.
            child.type === "paragraph" && i > 0 ? blocks([child], { quote: ctx.quote }) : blocks([child], { list, level }),
          ),
        );
      }
      case "blockquote":
        return blocks(n.content, { ...ctx, quote: true });
      case "codeBlock":
        return [new Paragraph({ children: [new TextRun({ text: n.content?.map((c) => c.text).join("") ?? "", font: "Courier New" })] })];
      case "horizontalRule":
        return [new Paragraph({ thematicBreak: true, children: [] })];
      default:
        return n.content ? blocks(n.content, ctx) : [];
    }
  });
}

export async function exportDocx(title: string, content: JSONContent) {
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        children: [
          ...(title ? [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] })] : []),
          ...blocks(content.content),
        ],
      },
    ],
  });
  download(await Packer.toBlob(doc), `${safeFilename(title)}.docx`);
}
