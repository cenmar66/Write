import { audit, body, handle, HttpError, loadPrefs } from "@/lib/inbox/server/workspace";
import type { Preferences } from "@/lib/inbox/types";

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET() {
  return handle(async (ctx) => ({ prefs: await loadPrefs(ctx) }));
}

/** Validated preference updates (privacy, AI, automation, briefing, focus, writing profile). */
export async function PATCH(request: Request) {
  return handle(async (ctx) => {
    const b = await body<Partial<Preferences>>(request);
    const cur = await loadPrefs(ctx);
    const p: Record<string, unknown> = {};
    if (b.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: b.timezone });
      } catch {
        throw new HttpError(400, "Unknown time zone.");
      }
      p.timezone = b.timezone;
    }
    if (b.automation_mode && ["observe", "assisted", "automatic"].includes(b.automation_mode)) p.automation_mode = b.automation_mode;
    if (b.ai_content && ["metadata", "snippet", "full"].includes(b.ai_content)) p.ai_content = b.ai_content;
    if (b.ai_external !== undefined) p.ai_external = !!b.ai_external;
    if (b.ai_provider && ["anthropic", "openai"].includes(b.ai_provider)) p.ai_provider = b.ai_provider;
    if (b.ai_drafts !== undefined) p.ai_drafts = !!b.ai_drafts;
    if (b.learn_from_sent !== undefined) p.learn_from_sent = !!b.learn_from_sent;
    if (b.ai_monthly_request_cap !== undefined) p.ai_monthly_request_cap = Math.max(0, Math.min(100_000, Math.round(Number(b.ai_monthly_request_cap)) || 0));
    if (b.body_retention_days !== undefined) p.body_retention_days = Math.max(0, Math.min(365, Math.round(Number(b.body_retention_days)) || 0));
    if (b.followup_days !== undefined) p.followup_days = Math.max(1, Math.min(60, Math.round(Number(b.followup_days)) || 3));
    if (b.briefing) {
      const br = { ...cur.briefing, ...b.briefing };
      for (const k of ["morning", "midday", "evening"] as const) if (br[k] !== null && !HM.test(String(br[k]))) throw new HttpError(400, `Briefing time for ${k} must be HH:MM.`);
      br.mode = br.mode === "expanded" ? "expanded" : "concise";
      br.channels = (br.channels ?? ["in_app"]).filter((c: string) => c === "in_app");
      p.briefing = br;
    }
    if (b.focus) {
      const f = { ...cur.focus, ...b.focus };
      f.windows = (f.windows ?? []).slice(0, 10).filter((w) => HM.test(w.start) && HM.test(w.end) && w.start < w.end).map((w) => ({ days: (w.days ?? []).filter((d) => d >= 0 && d <= 6), start: w.start, end: w.end }));
      p.focus = { enabled: !!f.enabled, windows: f.windows, allow_vip: !!f.allow_vip, allow_critical: !!f.allow_critical };
    }
    if (b.writing_profile) {
      const w = b.writing_profile;
      const s = (v: unknown, n: number) => (v == null ? undefined : String(v).slice(0, n));
      p.writing_profile = {
        tone: s(w.tone, 80), greeting: s(w.greeting, 80), closing: s(w.closing, 80), signature: s(w.signature, 400), instructions: s(w.instructions, 1500),
        formality: ["casual", "neutral", "formal"].includes(String(w.formality)) ? w.formality : undefined,
        conciseness: ["brief", "balanced", "detailed"].includes(String(w.conciseness)) ? w.conciseness : undefined,
        language: ["en", "es"].includes(String(w.language)) ? w.language : undefined,
      };
    }
    if (b.onboarding) p.onboarding = { ...cur.onboarding, ...b.onboarding };
    if (b.ui) p.ui = { ...cur.ui, ...b.ui };
    await ctx.db.from("ip_preferences").update(p).eq("user_id", ctx.userId);
    const privacy = ["ai_external", "ai_content", "body_retention_days", "learn_from_sent", "automation_mode", "ai_provider"].filter((k) => k in p);
    if (privacy.length) await audit(ctx.db, null, "user", "settings.privacy", null, Object.fromEntries(privacy.map((k) => [k, p[k]])));
    // Shorter retention applies to bodies already stored, too.
    if (p.body_retention_days === 0) {
      const { data: mem } = await ctx.db.from("ip_memberships").select("workspace_id").eq("user_id", ctx.userId);
      const ids = (mem ?? []).map((m) => m.workspace_id);
      if (ids.length) await ctx.db.from("ip_messages").update({ body_text: null, body_expires_at: null }).in("workspace_id", ids);
    }
    return { prefs: await loadPrefs(ctx) };
  });
}
