import { parseImport } from "@/lib/dojo/export";
import { dojoContext, jsonError, serviceFailure } from "@/lib/dojo/server";

export const maxDuration = 120;

/** Imports a PromptDojo JSON export. Imported text is stored as data only. */
export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  if (Number(request.headers.get("content-length") ?? 0) > 5_000_000) return jsonError("That file is too large (max 5 MB).", 413);
  let raw: unknown;
  try {
    raw = JSON.parse(await request.text());
  } catch {
    return jsonError("That file isn't valid JSON.", 400);
  }
  const parsed = parseImport(raw);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  try {
    const collections = new Map((await ctx.store.listCollections()).map((c) => [c.name.toLowerCase(), c.id]));
    let prompts = 0;
    for (const p of parsed.data.prompts) {
      let collection_id: string | null = null;
      if (p.collection) {
        const key = p.collection.toLowerCase();
        if (!collections.has(key)) collections.set(key, (await ctx.store.createCollection(p.collection.slice(0, 80))).id);
        collection_id = collections.get(key)!;
      }
      await ctx.store.createPrompt({
        title: p.title,
        description: p.description,
        category: p.category,
        collection_id,
        target_model: p.target_model,
        custom_target: p.custom_target,
        favorite: p.favorite,
        tags: p.tags,
        source: "import",
        versions: p.versions.map((v) => ({ content: v.content, kind: v.kind, instruction: v.instruction })),
      });
      prompts++;
    }
    for (const t of parsed.data.templates) await ctx.store.createTemplate(t);
    return Response.json({ imported: { prompts, templates: parsed.data.templates.length } });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
