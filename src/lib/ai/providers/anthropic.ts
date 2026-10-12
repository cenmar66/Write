import Anthropic from "@anthropic-ai/sdk";
import type { Provider, TextRequest } from "./types";

// Server-only. Reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

export const anthropicProvider: Provider = {
  async *streamText({ model, system, messages, effort, maxTokens }: TextRequest) {
    const stream = client.beta.messages.stream({
      model: model.id,
      max_tokens: maxTokens,
      output_config: { effort },
      // If a safety check declines, the API retries on a recommended model.
      ...(model.serverFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      cache_control: { type: "ephemeral" },
      system,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "\n\n[The AI couldn't help with this one.]";
  },

  async generateJson({ model, system, messages, effort, maxTokens }, schema) {
    const response = await client.beta.messages.create({
      model: model.id,
      max_tokens: maxTokens,
      output_config: { effort, format: { type: "json_schema", schema } },
      ...(model.serverFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      system,
      messages,
    });
    if (response.stop_reason === "refusal") throw new Error("The AI declined this request.");
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("The AI returned no answer.");
    return JSON.parse(text.text);
  },

  describeError(error) {
    if (error instanceof Anthropic.AuthenticationError) return "The Claude API key is missing or wrong.";
    if (error instanceof Anthropic.PermissionDeniedError) return "Your Claude account can't use this model. Try another one in Settings.";
    if (error instanceof Anthropic.NotFoundError) return "That Claude model isn't available. Pick another one in Settings.";
    if (error instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a moment.";
    return "Something went wrong talking to Claude.";
  },
};
