import { PreferencesBody } from "@/lib/satori/api-schemas";
import { satoriContext, jsonError, readBody, serviceFailure } from "@/lib/satori/server";

export async function GET() {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    return Response.json({ preferences: await ctx.store.getPreferences() });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function PATCH(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, PreferencesBody);
  if ("denied" in body) return body.denied;
  try {
    if (body.data.active_profile_id && !(await ctx.store.getProfile(body.data.active_profile_id))) return jsonError("Profile not found.", 404);
    return Response.json({ preferences: await ctx.store.savePreferences(body.data) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
