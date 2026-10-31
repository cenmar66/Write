import { GenerateBody } from "@/lib/dojo/api-schemas";
import { metaVersions } from "@/lib/dojo/meta-prompts";
import { checkLimits, dojoContext, notConfigured, pickProvider, readBody, recordUsage, servedBy, serviceFailure } from "@/lib/dojo/server";
import { clarify, generate } from "@/lib/dojo/services";
import { looksLikeInjection } from "@/lib/dojo/untrusted";

export const maxDuration = 300;

/**
 * Plain-English request -> prompt package. When clarification is on and nothing has been
 * answered yet, may first return up to three questions (stage "clarify"); the client can
 * answer them or send skipClarify to proceed with labelled assumptions.
 */
export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, GenerateBody);
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
    const input = { request: b.request, target: b.target, profile, options: b.options, answers: b.answers };

    if (!b.skipClarify && prefs.clarify && b.answers.length === 0) {
      const c = await clarify(choice, input);
      await recordUsage(ctx, c.usage);
      if (c.data.needs_clarification && c.data.questions.length) {
        return Response.json({ stage: "clarify", reason: c.data.reason, questions: c.data.questions, servedBy: servedBy(c) });
      }
    }

    const g = await generate(choice, input);
    await recordUsage(ctx, g.usage);
    const record = await ctx.store.createGeneration({
      request: b.request,
      target_model: b.target.id,
      custom_target: b.target.id === "custom" ? b.target.customName ?? "" : "",
      provider: g.provider,
      model: g.model,
      is_mock: g.isMock,
      meta_prompt_version: g.metaPrompt.version,
      schema_version: g.schemaVersion,
      profile_id: profile?.id ?? null,
      options: { ...b.options, customNotes: b.target.customNotes ?? "", metaVersions: metaVersions() },
      answers: b.answers,
      result: g.data,
    });
    if (prefs.retention_days) void ctx.store.applyRetention(prefs.retention_days).catch(() => {});
    return Response.json({ stage: "done", generation: record, servedBy: servedBy(g), injectionWarning: looksLikeInjection(b.request) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
