import { ProfileInput } from "@/lib/satori/profiles";
import { satoriContext, readBody, serviceFailure } from "@/lib/satori/server";

export async function GET() {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    return Response.json({ profiles: await ctx.store.listProfiles() });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function POST(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, ProfileInput);
  if ("denied" in body) return body.denied;
  try {
    return Response.json({ profile: await ctx.store.saveProfile(body.data) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
