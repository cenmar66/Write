import { PreferencesBody } from "@/lib/dojo/api-schemas";
import { dojoContext, jsonError, readBody, serviceFailure } from "@/lib/dojo/server";

export async function GET() {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    return Response.json({ preferences: await ctx.store.getPreferences() });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function PATCH(request: Request) {
  const ctx = await dojoContext();
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
