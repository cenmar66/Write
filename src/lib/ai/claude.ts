import Anthropic from "@anthropic-ai/sdk";
import { isAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Server-only. Reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

export const MODEL = "claude-opus-5-5";

/** API routes double-check the caller is the owner (the proxy checks too). */
export async function requireOwner(): Promise<Response | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isAllowed(data?.claims?.email as string | undefined)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

type StreamOptions = {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort: "low" | "medium" | "high";
  maxTokens: number;
};

/** Streams Claude's reply back to the browser as plain text. */
export function streamText({ system, messages, effort, maxTokens }: StreamOptions): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: maxTokens,
          output_config: { effort },
          // If a safety check declines, the API retries on a recommended model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          cache_control: { type: "ephemeral" },
          system,
          messages,
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[The AI couldn't help with this one.]"));
        }
        controller.close();
      } catch (error) {
        console.error("Claude request failed", error);
        const message =
          error instanceof Anthropic.AuthenticationError
            ? "The Claude API key is missing or wrong."
            : error instanceof Anthropic.RateLimitError
              ? "Claude is busy right now. Try again in a moment."
              : "Something went wrong talking to Claude.";
        controller.enqueue(encoder.encode(`\n\n[${message}]`));
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
