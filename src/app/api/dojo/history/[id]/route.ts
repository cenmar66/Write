import { dojoContext, jsonError, serviceFailure } from "@/lib/dojo/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    const generation = await ctx.store.getGeneration((await params).id);
    return generation ? Response.json({ generation }) : jsonError("Not found.", 404);
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    await ctx.store.deleteGeneration((await params).id);
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
