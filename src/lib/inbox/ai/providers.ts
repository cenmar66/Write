// Provider adapters for InboxPilot's AI calls. Each returns schema-validated JSON plus
// token usage. Nothing here has tools: the model can only answer.

import Anthropic from "@anthropic-ai/sdk";
import type { InboxModel } from "./models";
import { EFFORT } from "./models";

export interface JsonRequest {
  model: InboxModel;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens: number;
}

export interface JsonResult {
  data: unknown;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface JsonProvider {
  available(): boolean;
  generate(req: JsonRequest): Promise<JsonResult>;
}

let anthropicClient: Anthropic | null = null;

export const anthropicJson: JsonProvider = {
  available: () => !!process.env.ANTHROPIC_API_KEY,
  async generate(req) {
    anthropicClient ??= new Anthropic();
    const response = await anthropicClient.beta.messages.create({
      model: req.model.id,
      max_tokens: req.maxTokens,
      output_config: { effort: EFFORT[req.model.tier], format: { type: "json_schema", schema: req.schema } },
      ...(req.model.serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
    if (response.stop_reason === "refusal") throw new AiUnavailable("The AI declined this request.");
    if (response.stop_reason === "max_tokens") throw new AiUnavailable("The AI answer was cut off.");
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new AiUnavailable("The AI returned no answer.");
    return { data: JSON.parse(text.text), inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, model: response.model };
  },
};

/** OpenAI Chat Completions with a strict JSON schema response format. */
export const openAiJson: JsonProvider = {
  available: () => !!process.env.OPENAI_API_KEY && !!(process.env.OPENAI_MODEL || process.env.OPENAI_MODEL_FAST),
  async generate(req) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model.id,
        max_completion_tokens: req.maxTokens,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        response_format: { type: "json_schema", json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
      }),
      cache: "no-store",
    });
    const json = (await r.json()) as { choices?: { message?: { content?: string; refusal?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
    if (!r.ok) throw new AiUnavailable(json.error?.message ?? `OpenAI error ${r.status}`);
    const msg = json.choices?.[0]?.message;
    if (!msg?.content) throw new AiUnavailable(msg?.refusal ? "The AI declined this request." : "The AI returned no answer.");
    return { data: JSON.parse(msg.content), inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0, model: req.model.id };
  },
};

export class AiUnavailable extends Error {}

/** Turns provider errors into plain sentences without leaking details. */
export function describeAiError(e: unknown): string {
  if (e instanceof AiUnavailable) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "The AI key is missing or wrong.";
  if (e instanceof Anthropic.RateLimitError) return "The AI is busy right now. Try again in a moment.";
  if (e instanceof Anthropic.APIError) return `The AI service returned an error (${e.status ?? "?"}).`;
  if (e instanceof SyntaxError) return "The AI returned an unreadable answer.";
  return "The AI service couldn't be reached.";
}
