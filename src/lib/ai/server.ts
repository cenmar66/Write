import type { SupabaseClient } from "@supabase/supabase-js";
import { isAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MODEL, findModel, type ModelOption } from "./models";
import { formatVoice, normalizeProfile } from "./voice";
import { PROVIDERS } from "./providers";
import type { TextRequest } from "./providers/types";

/**
 * API routes double-check the caller is the owner (the proxy checks too).
 * Returns the signed-in Supabase client, or an error response.
 */
export async function requireOwner(): Promise<{ supabase: SupabaseClient } | { denied: Response }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isAllowed(data?.claims?.email as string | undefined)) {
    return { denied: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { supabase };
}

/** The model picked in Settings, plus your voice instructions when the voice is switched on. */
export async function loadAiSettings(supabase: SupabaseClient): Promise<{ model: ModelOption; voice: string }> {
  const { data } = await supabase
    .from("user_settings")
    .select("ai_model,voice_enabled,voice_profile")
    .maybeSingle();
  const model = findModel(data?.ai_model ?? process.env.AI_MODEL ?? DEFAULT_MODEL);
  const voiceOn = data?.voice_enabled ?? true;
  const voice = voiceOn && data?.voice_profile ? formatVoice(normalizeProfile(data.voice_profile)) : "";
  return { model, voice };
}

/** Streams the model's reply back to the browser as plain text. */
export function streamText(request: TextRequest): Response {
  const provider = PROVIDERS[request.model.provider];
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of provider.streamText(request)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        console.error(`AI request failed (${request.model.id})`, error);
        controller.enqueue(encoder.encode(`\n\n[${provider.describeError(error)}]`));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-AI-Model": request.model.id,
    },
  });
}
