// OpenAI / Gemini adapters against simulated API responses (no network).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiSatori, needsResponsesApi, openaiSatori } from "@/lib/satori/providers/http";
import { ProviderError } from "@/lib/satori/providers/types";

const req = { model: "gpt-x", system: "sys", user: "hello", maxTokens: 100, json: { name: "t", schema: { type: "object" } } };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test-secret-123456");
  vi.stubEnv("GEMINI_API_KEY", "AIzaTestKey1234567890");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OpenAI adapter", () => {
  it("parses Chat Completions and maps a length cut-off", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(200, { model: "gpt-x-2026", choices: [{ message: { content: '{"a":1}' }, finish_reason: "length" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    vi.stubGlobal("fetch", fetch);
    const r = await openaiSatori.complete(req);
    expect(r).toMatchObject({ text: '{"a":1}', model: "gpt-x-2026", stopReason: "max_tokens", usage: { inputTokens: 10, outputTokens: 5 } });
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(fetch.mock.calls[0][0]).toMatch(/\/chat\/completions$/);
    expect(sent.response_format.json_schema.strict).toBe(true);
  });

  it("switches to the Responses API when OpenAI says the model needs it", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(400, { error: { message: "This model is only supported in v1/responses and not in v1/chat/completions." } }))
      .mockResolvedValueOnce(reply(200, { model: "gpt-x", status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] }], usage: { input_tokens: 7, output_tokens: 3 } }));
    vi.stubGlobal("fetch", fetch);
    const r = await openaiSatori.complete(req);
    expect(fetch.mock.calls[1][0]).toMatch(/\/responses$/);
    const sent = JSON.parse(fetch.mock.calls[1][1].body);
    expect(sent).toMatchObject({ instructions: "sys", input: "hello", max_output_tokens: 100, text: { format: { type: "json_schema", strict: true } } });
    expect(r).toMatchObject({ text: '{"ok":true}', usage: { inputTokens: 7, outputTokens: 3 } });
  });

  it("shows OpenAI's own reason, never the key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(400, { error: { message: "Invalid schema for response_format 't'. Key sk-test-secret-123456 rejected." } })));
    const err = (await openaiSatori.complete(req).catch((e) => e)) as ProviderError;
    expect(err.message).toContain("Invalid schema for response_format");
    expect(err.message).not.toContain("sk-test");
    expect(openaiSatori.describeError(err)).toBe(err.message);
  });

  it("explains a timeout instead of 'couldn't reach'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
    const err = (await openaiSatori.complete(req).catch((e) => e)) as ProviderError;
    expect(err.message).toMatch(/took too long/);
    expect(err.retryable).toBe(true);
  });

  it("only falls back for the Responses-API wording", () => {
    expect(needsResponsesApi(new ProviderError("x", 400, false, "Use the Responses API for this model."))).toBe(true);
    expect(needsResponsesApi(new ProviderError("x", 400, false, "Invalid schema"))).toBe(false);
    expect(needsResponsesApi(new ProviderError("x", 401, false, "only supported in v1/responses"))).toBe(false);
  });
});

describe("Gemini adapter", () => {
  it("maps MAX_TOKENS and surfaces Google's reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(200, { modelVersion: "g-1", candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "MAX_TOKENS" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } })));
    expect(await geminiSatori.complete({ ...req, model: "g-1" })).toMatchObject({ stopReason: "max_tokens", text: "hi" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(400, { error: { message: "API key AIzaTestKey1234567890 not valid." } })));
    const err = (await geminiSatori.complete({ ...req, model: "g-1" }).catch((e) => e)) as ProviderError;
    expect(err.message).toContain("not valid");
    expect(err.message).not.toContain("AIza");
  });
});

describe("provider setup status", () => {
  it("names missing settings without revealing values", async () => {
    const { missingSettings } = await import("@/lib/satori/providers");
    vi.stubEnv("OPENAI_API_KEY", "sk-abc");
    vi.stubEnv("OPENAI_MODELS", " , ");
    expect(missingSettings("openai")).toEqual(["OPENAI_MODELS"]);
    vi.stubEnv("OPENAI_MODELS", "gpt-x");
    expect(missingSettings("openai")).toEqual([]);
  });
});
