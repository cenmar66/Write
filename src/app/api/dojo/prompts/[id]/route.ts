import { PatchPromptBody } from "@/lib/dojo/api-schemas";
import { dojoContext, jsonError, readBody, serviceFailure } from "@/lib/dojo/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    const prompt = await ctx.store.getPrompt((await params).id);
    return prompt ? Response.json({ prompt }) : jsonError("Prompt not found.", 404);
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, PatchPromptBody);
  if ("denied" in body) return body.denied;
  const { id } = await params;
  try {
    const { restore, ...patch } = body.data;
    if (!(await ctx.store.getPrompt(id))) return jsonError("Prompt not found.", 404);
    if (restore) await ctx.store.restorePrompt(id);
    const prompt = Object.keys(patch).length ? await ctx.store.updatePrompt(id, patch) : await ctx.store.getPrompt(id);
    return Response.json({ prompt });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

/** ?forever=1 deletes permanently; otherwise the prompt moves to the trash. */
export async function DELETE(request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const { id } = await params;
  try {
    if (new URL(request.url).searchParams.get("forever") === "1") await ctx.store.deletePromptForever(id);
    else await ctx.store.trashPrompt(id);
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
