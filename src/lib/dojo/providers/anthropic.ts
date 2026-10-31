import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/lib/ai/models";
import type { DojoProvider } from "./types";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export const anthropicDojo: DojoProvider = {
  id: "anthropic",
  label: "Claude (Anthropic)",
  configured: () => !!process.env.ANTHROPIC_API_KEY,
  models: () => MODELS.map((m) => ({ id: m.id, label: m.label })),

  async complete({ model, system, user, maxTokens, effort, json }) {
    const fallback = MODELS.find((m) => m.id === model)?.serverFallback ?? false;
    const response = await getClient().beta.messages.create({
      model,
      max_tokens: maxTokens,
      output_config: { effort: effort ?? "medium", ...(json ? { format: { type: "json_schema" as const, schema: json.schema } } : {}) },
      // If a safety check declines, the API retries on a recommended model and reports it in `model`.
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      cache_control: { type: "ephemeral" },
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") throw new Error("REFUSAL");
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return {
      text,
      model: response.model,
      stopReason: response.stop_reason ?? null,
      usage: { inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0), outputTokens: response.usage.output_tokens },
    };
  },

  describeError(error) {
    if (error instanceof Error && error.message === "REFUSAL") return "Claude declined this request.";
    if (error instanceof Anthropic.AuthenticationError) return "The Claude API key is missing or wrong.";
    if (error instanceof Anthropic.PermissionDeniedError) return "This Claude account can't use that model. Pick another one in Settings.";
    if (error instanceof Anthropic.NotFoundError) return "That Claude model isn't available. Pick another one in Settings.";
    if (error instanceof Anthropic.RateLimitError) return "Claude is busy or rate-limited right now. Try again in a moment.";
    if (error instanceof Anthropic.BadRequestError) return "Claude rejected the request (it may be too long).";
    if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the connection and try again.";
    return "Something went wrong talking to Claude.";
  },
};
