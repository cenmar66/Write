import { NameBody } from "@/lib/satori/api-schemas";
import { satoriContext, readBody, serviceFailure } from "@/lib/satori/server";

export async function GET() {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    return Response.json({ collections: await ctx.store.listCollections() });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function POST(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, NameBody);
  if ("denied" in body) return body.denied;
  try {
    const existing = await ctx.store.listCollections();
    if (existing.some((c) => c.name.toLowerCase() === body.data.name.toLowerCase())) return Response.json({ error: "A collection with that name already exists." }, { status: 409 });
    return Response.json({ collection: await ctx.store.createCollection(body.data.name) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
