import { RefineBody } from "@/lib/dojo/api-schemas";
import { checkLimits, dojoContext, notConfigured, pickProvider, readBody, recordUsage, servedBy, serviceFailure } from "@/lib/dojo/server";
import { refine } from "@/lib/dojo/services";

export const maxDuration = 300;

export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, RefineBody);
  if ("denied" in body) return body.denied;
  const b = body.data;
  const limited = await checkLimits(ctx, "ai");
  if (limited) return limited;
  const choice = await pickProvider(ctx, b);
  if (!choice) return notConfigured();
  try {
    const prefs = await ctx.store.getPreferences();
    const profileId = b.profileId === undefined ? prefs.active_profile_id : b.profileId;
    const profile = profileId ? await ctx.store.getProfile(profileId) : null;
    const r = await refine(choice, { prompt: b.prompt, instruction: b.instruction, originalRequest: b.originalRequest, target: b.target, profile });
    await recordUsage(ctx, r.usage);
    return Response.json({ result: r.data, servedBy: servedBy(r), metaPrompt: r.metaPrompt });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
