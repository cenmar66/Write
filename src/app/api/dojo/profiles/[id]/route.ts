import { ProfileInput } from "@/lib/dojo/profiles";
import { dojoContext, jsonError, readBody, serviceFailure } from "@/lib/dojo/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, ProfileInput);
  if ("denied" in body) return body.denied;
  const { id } = await params;
  try {
    if (!(await ctx.store.getProfile(id))) return jsonError("Profile not found.", 404);
    return Response.json({ profile: await ctx.store.saveProfile(body.data, id) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    await ctx.store.deleteProfile((await params).id);
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
