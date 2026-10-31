import { NameBody } from "@/lib/dojo/api-schemas";
import { dojoContext, readBody, serviceFailure } from "@/lib/dojo/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, NameBody);
  if ("denied" in body) return body.denied;
  try {
    await ctx.store.renameCollection((await params).id, body.data.name);
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

/** Prompts in the collection stay in the library, just uncollected. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    await ctx.store.deleteCollection((await params).id);
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
