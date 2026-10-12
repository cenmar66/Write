import { TONES, type Tone } from "@/lib/ai/actions";
import { DICTATION_SCHEMA, DICTATION_SYSTEM, type DictationResult, VOICE_COMMANDS, type VoiceCommand } from "@/lib/ai/dictation";
import { PROVIDERS } from "@/lib/ai/providers";
import { requireOwner, selectedModel } from "@/lib/ai/server";

export const maxDuration = 60;

type Raw = { kind?: string; text?: string; command?: string; tone?: string };

export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;

  const { transcript } = (await request.json()) as { transcript?: string };
  if (typeof transcript !== "string" || !transcript.trim()) {
    return Response.json({ error: "Nothing was said." }, { status: 400 });
  }

  const model = await selectedModel(auth.supabase);
  const provider = PROVIDERS[model.provider];
  try {
    const raw = (await provider.generateJson(
      {
        model,
        system: DICTATION_SYSTEM,
        messages: [{ role: "user", content: `<dictation>\n${transcript}\n</dictation>` }],
        effort: "low",
        maxTokens: 8000,
      },
      DICTATION_SCHEMA,
    )) as Raw;

    let result: DictationResult;
    if (raw.kind === "command" && VOICE_COMMANDS.includes(raw.command as VoiceCommand)) {
      const tone = TONES.includes(raw.tone as Tone) ? (raw.tone as Tone) : undefined;
      result = { kind: "command", command: raw.command as VoiceCommand, tone };
    } else {
      result = { kind: "text", text: (raw.text ?? "").trim() || transcript.trim() };
    }
    return Response.json(result);
  } catch (error) {
    console.error("Dictation cleanup failed", error);
    return Response.json({ error: provider.describeError(error) }, { status: 502 });
  }
}
