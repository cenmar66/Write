// Export to Markdown / plain text / JSON, and validated import of PromptDojo JSON.
import { z } from "zod";
import { TargetId } from "./schema";
import type { CustomTemplate, PromptRecord, PromptVersion } from "./store/types";
import { VERSION_KINDS } from "./store/types";
import { TARGETS } from "./targets";

export const EXPORT_FORMAT = "promptdojo.export";
export const EXPORT_VERSION = 1;

type Exportable = PromptRecord & { versions?: PromptVersion[]; collection?: string };

const targetLabel = (p: Pick<PromptRecord, "target_model" | "custom_target">) => (p.target_model === "custom" ? p.custom_target || "Custom model" : TARGETS[p.target_model].label);

export function toMarkdown(prompts: Exportable[]): string {
  return prompts
    .map((p) => {
      const meta = [`Target: ${targetLabel(p)}`, p.category && `Category: ${p.category}`, p.tags.length && `Tags: ${p.tags.join(", ")}`, `Updated: ${p.updated_at.slice(0, 10)}`].filter(Boolean).join(" · ");
      const fence = p.content.includes("```") ? "````" : "```";
      return `# ${p.title}\n\n${p.description ? `${p.description}\n\n` : ""}_${meta}_\n\n${fence}\n${p.content}\n${fence}\n`;
    })
    .join("\n---\n\n");
}

export function toText(prompts: Exportable[]): string {
  return prompts.map((p) => `${p.title}\n${"=".repeat(Math.min(p.title.length, 80))}\n\n${p.content}\n`).join("\n\n");
}

export function toJson(prompts: Exportable[], templates: CustomTemplate[] = []) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    prompts: prompts.map((p) => ({
      title: p.title,
      description: p.description,
      category: p.category,
      collection: p.collection ?? null,
      target_model: p.target_model,
      custom_target: p.custom_target,
      favorite: p.favorite,
      tags: p.tags,
      created_at: p.created_at,
      versions: (p.versions?.length ? p.versions : [{ content: p.content, kind: "edited", instruction: "", created_at: p.updated_at }]).map((v) => ({
        content: v.content,
        kind: v.kind,
        instruction: v.instruction,
        created_at: v.created_at,
      })),
    })),
    templates: templates.map(({ title, description, category, body, fields }) => ({ title, description, category, body, fields })),
  };
}

const ImportVersion = z.object({ content: z.string().min(1).max(60000), kind: z.enum(VERSION_KINDS).catch("imported"), instruction: z.string().max(4000).catch(""), created_at: z.string().optional() });

export const ImportFile = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().min(1).max(EXPORT_VERSION),
  prompts: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(2000).catch(""),
        category: z.string().max(80).catch(""),
        collection: z.string().max(80).nullable().catch(null),
        target_model: TargetId.catch("universal"),
        custom_target: z.string().max(80).catch(""),
        favorite: z.boolean().catch(false),
        tags: z.array(z.string().max(40)).max(20).catch([]),
        versions: z.array(ImportVersion).min(1).max(100),
      }),
    )
    .max(500),
  templates: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(2000).catch(""),
        category: z.string().max(80).catch(""),
        body: z.string().min(1).max(60000),
        fields: z
          .array(z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), label: z.string().max(120), placeholder: z.string().max(300).catch(""), help: z.string().max(300).catch(""), required: z.boolean().catch(true) }))
          .max(30)
          .catch([]),
      }),
    )
    .max(200)
    .default([]),
});
export type ImportFile = z.infer<typeof ImportFile>;

export function parseImport(raw: unknown): { ok: true; data: ImportFile } | { ok: false; error: string } {
  const r = ImportFile.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const issue = r.error.issues[0];
  return { ok: false, error: issue?.path[0] === "format" ? "This isn't a PromptDojo export file." : `Import file problem at ${issue?.path.join(".") || "root"}: ${issue?.message}` };
}
