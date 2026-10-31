import { satoriContext, serviceFailure } from "@/lib/satori/server";

export async function GET(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 100) || undefined;
  try {
    return Response.json({ generations: await ctx.store.listGenerations({ q, limit: 100 }) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
