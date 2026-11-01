import { satoriContext, serviceFailure } from "@/lib/satori/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    await ctx.store.deleteTestRun((await params).id);
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
