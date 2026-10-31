// OpenAI and Gemini, called over their documented REST APIs (no extra SDKs).
// Both are optional and only appear when their key AND model list are configured, so the
// app never guesses model names. They have not been exercised against live accounts in
// this repository's tests; see docs/dojo/ARCHITECTURE.md.
import { ProviderError, type DojoProvider, type ProviderModel } from "./types";

function modelList(envName: string): ProviderModel[] {
  return (process.env[envName] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => ({ id, label: id }));
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, label: string) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(110_000) });
  } catch {
    throw new ProviderError(`Couldn't reach ${label}.`, 502, true);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      res.status === 401 || res.status === 403
        ? `The ${label} API key is missing or not allowed to use this model.`
        : res.status === 404
          ? `That ${label} model isn't available.`
          : res.status === 429
            ? `${label} is rate-limited right now. Try again shortly.`
            : `${label} returned an error (${res.status}).`;
    throw new ProviderError(msg, res.status, res.status === 429 || res.status >= 500);
  }
  return data;
}

const describe = (label: string) => (error: unknown) => (error instanceof ProviderError ? error.message : `Something went wrong talking to ${label}.`);

export const openaiDojo: DojoProvider = {
  id: "openai",
  label: "OpenAI",
  configured: () => !!process.env.OPENAI_API_KEY && modelList("OPENAI_MODELS").length > 0,
  models: () => modelList("OPENAI_MODELS"),
  async complete({ model, system, user, maxTokens, json }) {
    const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const data = (await postJson(
      `${base}/chat/completions`,
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      {
        model,
        max_completion_tokens: maxTokens,
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }],
        ...(json ? { response_format: { type: "json_schema", json_schema: { name: json.name, schema: json.schema, strict: true } } } : {}),
      },
      "OpenAI",
    )) as {
      model?: string;
      choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new ProviderError("OpenAI declined this request.", 422);
    return {
      text: choice?.message?.content ?? "",
      model: data.model ?? model,
      stopReason: choice?.finish_reason ?? null,
      usage: data.usage ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 } : null,
    };
  },
  describeError: describe("OpenAI"),
};

export const geminiDojo: DojoProvider = {
  id: "gemini",
  label: "Google Gemini",
  configured: () => !!process.env.GEMINI_API_KEY && modelList("GEMINI_MODELS").length > 0,
  models: () => modelList("GEMINI_MODELS"),
  async complete({ model, system, user, maxTokens, json }) {
    const data = (await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(json ? { responseMimeType: "application/json", responseJsonSchema: json.schema } : {}),
        },
      },
      "Gemini",
    )) as {
      modelVersion?: string;
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) throw new ProviderError("Gemini blocked this request.", 422);
    const cand = data.candidates?.[0];
    return {
      text: (cand?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
      model: data.modelVersion ?? model,
      stopReason: cand?.finishReason ?? null,
      usage: data.usageMetadata ? { inputTokens: data.usageMetadata.promptTokenCount ?? 0, outputTokens: data.usageMetadata.candidatesTokenCount ?? 0 } : null,
    };
  },
  describeError: describe("Gemini"),
};
