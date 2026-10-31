import { AddVersionBody } from "@/lib/dojo/api-schemas";
import { dojoContext, jsonError, readBody, serviceFailure } from "@/lib/dojo/server";

/** Appends a version. Versions are never edited; "revert" appends a copy as a new version. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await dojoContext();
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
