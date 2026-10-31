import { dojoContext, serviceFailure } from "@/lib/dojo/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    await ctx.store.deleteTemplate((await params).id);
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
