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

/**
 * The model picked in Settings, plus the writing style to use (empty when styles are off).
 * Style order: the one you picked for this request, then the document's style, then your default style.
 * Pass styleId "none" to write with no style.
 */
export async function loadAiSettings(
  supabase: SupabaseClient,
  opts: { styleId?: string | null; documentId?: string | null } = {},
): Promise<{ model: ModelOption; voice: string }> {
  const { data } = await supabase
    .from("user_settings")
    .select("ai_model,voice_enabled,voice_profile")
    .maybeSingle();
  const model = findModel(data?.ai_model ?? process.env.AI_MODEL ?? DEFAULT_MODEL);
  // The global switch turns styles off, unless you picked one for this request.
  if (opts.styleId === "none" || (!(data?.voice_enabled ?? true) && !opts.styleId)) return { model, voice: "" };

  const profile = await resolveStyleProfile(supabase, opts);
  const raw = profile ?? data?.voice_profile;
  return { model, voice: raw ? formatVoice(normalizeProfile(raw)) : "" };
}

async function resolveStyleProfile(supabase: SupabaseClient, opts: { styleId?: string | null; documentId?: string | null }) {
  const pick = async (filter: (q: ReturnType<typeof styles>) => ReturnType<typeof styles>) => {
    const { data, error } = await filter(styles()).limit(1).maybeSingle();
    return error ? undefined : data;
  };
  const styles = () => supabase.from("writing_styles").select("id,profile");

  let styleId = opts.styleId || null;
  if (!styleId && opts.documentId) {
    const { data } = await supabase.from("documents").select("style_id").eq("id", opts.documentId).maybeSingle();
    styleId = (data?.style_id as string | null) ?? null;
  }
  const row = (styleId && (await pick((q) => q.eq("id", styleId)))) || (await pick((q) => q.eq("is_default", true)));
  return row?.profile ?? null;
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
