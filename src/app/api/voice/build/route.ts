import { PROVIDERS } from "@/lib/ai/providers";
import { loadAiSettings, requireOwner } from "@/lib/ai/server";
import { normalizeProfile, VOICE_BUILD_SYSTEM, VOICE_SAMPLE_CHAR_LIMIT, VOICE_SCHEMA } from "@/lib/ai/voice";

export const maxDuration = 300;

const MIN_WORDS = 150;

export async function POST() {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { supabase } = auth;

  const { data: samples } = await supabase
    .from("voice_samples")
    .select("title,content,word_count")
    .order("created_at", { ascending: false });
  if (!samples?.length) return Response.json({ error: "Add a writing sample first." }, { status: 400 });

  // Newest first, until the size limit. The page tells you if some were left out.
  const used: typeof samples = [];
  let chars = 0;
  for (const s of samples) {
    if (used.length && chars + s.content.length > VOICE_SAMPLE_CHAR_LIMIT) break;
    used.push(s);
    chars += s.content.length;
  }
  const words = used.reduce((n, s) => n + s.word_count, 0);
  if (words < MIN_WORDS) {
    return Response.json({ error: `Add a bit more writing first (at least ${MIN_WORDS} words; you have ${words}).` }, { status: 400 });
  }

  const { model } = await loadAiSettings(supabase);
  const provider = PROVIDERS[model.provider];
  const body = used
    .map((s, i) => `<sample index="${i + 1}" title="${s.title.replace(/"/g, "'")}">\n${s.content}\n</sample>`)
    .join("\n\n");

  try {
    const raw = await provider.generateJson(
      {
        model,
        system: VOICE_BUILD_SYSTEM,
        messages: [{ role: "user", content: `Here are my writing samples. Build my voice profile.\n\n${body}` }],
        effort: "medium",
        maxTokens: 16000,
      },
      VOICE_SCHEMA,
    );
    const profile = normalizeProfile(raw);
    const { data: session } = await supabase.auth.getClaims();
    const { error } = await supabase.from("user_settings").upsert({
      user_id: session?.claims?.sub,
      voice_profile: profile,
      voice_profile_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return Response.json({ profile, usedSamples: used.length, totalSamples: samples.length, usedWords: words });
  } catch (error) {
    console.error("Voice build failed", error);
    return Response.json({ error: provider.describeError(error) }, { status: 502 });
  }
}
