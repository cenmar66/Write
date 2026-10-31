import { ProfileInput } from "@/lib/dojo/profiles";
import { dojoContext, readBody, serviceFailure } from "@/lib/dojo/server";

export async function GET() {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    return Response.json({ profiles: await ctx.store.listProfiles() });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, ProfileInput);
  if ("denied" in body) return body.denied;
  try {
    return Response.json({ profile: await ctx.store.saveProfile(body.data) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
