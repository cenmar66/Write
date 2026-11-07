import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/lib/ai/models";
import type { CompletionRequest, SatoriProvider } from "./types";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Block = Anthropic.Beta.Messages.BetaContentBlock;

/** Server tools can pause a long turn; resume at most this many times. */
const MAX_CONTINUATIONS = 4;
const MAX_SEARCHES = 5;

/** The Messages API request for one completion (exported for tests). */
export function buildAnthropicRequest({ model, system, user, maxTokens, effort, json, images, tools }: CompletionRequest): Params {
  const fallback = MODELS.find((m) => m.id === model)?.serverFallback ?? false;
  const connectors = tools?.connectors ?? [];
  const betas = [...(fallback ? ["server-side-fallback-2026-07-01"] : []), ...(connectors.length ? ["mcp-client-2025-11-20"] : [])];
  const toolList: Params["tools"] = [
    ...(tools?.webSearch ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: MAX_SEARCHES }] : []),
    ...connectors.map((c) => ({ type: "mcp_toolset" as const, mcp_server_name: c.name })),
  ];
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    ...(images ?? []).map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.data } })),
    { type: "text" as const, text: user },
  ];
  return {
    model,
    max_tokens: maxTokens,
    output_config: { effort: effort ?? "medium", ...(json ? { format: { type: "json_schema" as const, schema: json.schema } } : {}) },
    // If a safety check declines, the API retries on a recommended model and reports it in `model`.
    ...(betas.length ? { betas } : {}),
    ...(fallback ? { fallbacks: "default" as const } : {}),
    ...(toolList.length ? { tools: toolList } : {}),
    ...(connectors.length
      ? { mcp_servers: connectors.map((c) => ({ type: "url" as const, name: c.name, url: c.url, ...(c.token ? { authorization_token: c.token } : {}) })) }
      : {}),
    cache_control: { type: "ephemeral" },
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: images?.length ? content : user }],
  };
}

/** Plain-words record of tool use, for the result card. */
export function describeActivity(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "server_tool_use" && b.name === "web_search") {
      const q = (b.input as { query?: unknown })?.query;
      out.push(`Searched the web${typeof q === "string" ? `: “${q.slice(0, 120)}”` : ""}`);
    } else if (b.type === "mcp_tool_use") {
      out.push(`Used ${b.server_name}: ${b.name}`);
    }
  }
  return out;
}

export const anthropicSatori: SatoriProvider = {
  id: "anthropic",
  label: "Claude (Anthropic)",
  supportsTools: true,
  configured: () => !!process.env.ANTHROPIC_API_KEY,
  models: () => MODELS.map((m) => ({ id: m.id, label: m.label })),

  async complete(req) {
    const params = buildAnthropicRequest(req);
    const blocks: Block[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let webSearches = 0;
    let response: Anthropic.Beta.Messages.BetaMessage | null = null;
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      // On a paused turn, re-send the conversation so far; the server resumes on its own.
      const messages = turn === 0 ? params.messages : [params.messages[0], { role: "assistant" as const, content: blocks as unknown as Anthropic.Beta.Messages.BetaContentBlockParam[] }];
      response = await getClient().beta.messages.create({ ...params, messages });
      blocks.push(...response.content);
      const u = response.usage;
      inputTokens += u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      outputTokens += u.output_tokens;
      webSearches += u.server_tool_use?.web_search_requests ?? 0;
      if (response.stop_reason !== "pause_turn") break;
    }
    if (!response) throw new Error("No response");
    if (response.stop_reason === "refusal") throw new Error("REFUSAL");
    const text = blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
    const activity = describeActivity(blocks);
    return {
      text,
      model: response.model,
      stopReason: response.stop_reason === "pause_turn" ? "max_tokens" : (response.stop_reason ?? null),
      usage: { inputTokens, outputTokens, ...(webSearches ? { webSearches } : {}) },
      ...(activity.length ? { activity } : {}),
    };
  },

  describeError(error) {
    if (error instanceof Error && error.message === "REFUSAL") return "Claude declined this request.";
    if (error instanceof Anthropic.AuthenticationError) return "The Claude API key is missing or wrong.";
    if (error instanceof Anthropic.PermissionDeniedError) return "This Claude account can't use that model or feature. Pick another model in Settings.";
    if (error instanceof Anthropic.NotFoundError) return "That Claude model isn't available. Pick another one in Settings.";
    if (error instanceof Anthropic.RateLimitError) return "Claude is busy or rate-limited right now. Try again in a moment.";
    if (error instanceof Anthropic.BadRequestError) {
      // Claude's reason helps here (e.g. a connected app's server refused the connection).
      const reason = error.message.replace(/\b(sk-ant-[A-Za-z0-9_-]{6,})\S*/g, "[key]").replace(/\s+/g, " ").slice(0, 240);
      return `Claude rejected the request: ${reason}`;
    }
    if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the connection and try again.";
    return "Something went wrong talking to Claude.";
  },
};
