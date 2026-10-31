import { dojoContext, jsonError, serviceFailure } from "@/lib/dojo/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    const p = await ctx.store.getPrompt((await params).id);
    if (!p) return jsonError("Prompt not found.", 404);
    const prompt = await ctx.store.createPrompt({
      title: `${p.title} (copy)`.slice(0, 200),
      description: p.description,
      category: p.category,
      collection_id: p.collection_id,
      target_model: p.target_model,
      custom_target: p.custom_target,
      source: "duplicate",
      tags: p.tags,
      versions: [{ content: p.content, kind: "edited", instruction: `Duplicated from "${p.title}" v${p.version_count}` }],
    });
    return Response.json({ prompt });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
