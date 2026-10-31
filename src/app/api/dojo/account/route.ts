import { dojoContext, serviceFailure } from "@/lib/dojo/server";

/** Deletes every PromptDojo record you own (prompts, history, tests, usage, settings). */
export async function DELETE() {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    await ctx.store.deleteAllData();
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

/** Applies your retention setting now. */
export async function POST() {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    const prefs = await ctx.store.getPreferences();
    return Response.json({ removed: await ctx.store.applyRetention(prefs.retention_days) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
