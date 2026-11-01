import { AddVersionBody } from "@/lib/satori/api-schemas";
import { satoriContext, jsonError, readBody, serviceFailure } from "@/lib/satori/server";

/** Appends a version. Versions are never edited; "revert" appends a copy as a new version. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, AddVersionBody);
  if ("denied" in body) return body.denied;
  try {
    const version = await ctx.store.addVersion((await params).id, body.data);
    return version ? Response.json({ version }) : jsonError("Prompt not found.", 404);
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
