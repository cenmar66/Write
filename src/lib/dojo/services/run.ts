// Shared runner: sends a meta-prompt to a provider, parses the JSON, validates it with the
// versioned Zod schema, and retries once with the validation error if the shape is off.
import type { z } from "zod";
import type { MetaPrompt } from "../meta-prompts";
import { estimateCost } from "../pricing";
import type { ProviderChoice } from "../providers";
import type { Usage } from "../providers/types";
import { toProviderSchema } from "../schema";

export type UsageRecord = {
  kind: string;
  provider: string;
  requestedModel: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};

export type ServiceResult<T> = {
  data: T;
  provider: string;
  providerLabel: string;
  model: string;
  isMock: boolean;
  metaPrompt: { id: string; version: string };
  schemaVersion: string;
  usage: UsageRecord[];
};

export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
    public usage: UsageRecord[] = [],
  ) {
    super(message);
  }
}

function addUsage(a: Usage | null, b: Usage | null): Usage | null {
  if (!a) return b;
  if (!b) return a;
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

export async function runStructured<I, S extends z.ZodType>(opts: {
  choice: ProviderChoice;
  meta: MetaPrompt<I>;
  input: I;
  schema: S;
  schemaVersion: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<ServiceResult<z.infer<S>>> {
  const { provider, model } = opts.choice;
  const json = { name: opts.meta.id.replace(/[^a-z0-9_]/gi, "_"), schema: toProviderSchema(opts.schema) };
  const user = opts.meta.user(opts.input);
  let usage: Usage | null = null;
  let answeredBy = model;
  const records = (): UsageRecord[] => [
    {
      kind: opts.meta.id,
      provider: provider.id,
      requestedModel: model,
      model: answeredBy,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      costUsd: estimateCost(provider.id, answeredBy, usage),
    },
  ];

  let lastIssue = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const repair = attempt
      ? `\n\nYour previous answer could not be used because: ${lastIssue.slice(0, 800)}\nReturn the complete JSON again, correcting that.`
      : "";
    let res;
    try {
      res = await provider.complete({ model, system: opts.meta.system, user: user + repair, maxTokens: opts.maxTokens ?? 16000, effort: opts.effort, json, task: opts.meta.id });
    } catch (error) {
      const retryable = typeof error === "object" && error !== null && "retryable" in error ? Boolean((error as { retryable: boolean }).retryable) : true;
      console.error(`[dojo] ${opts.meta.id} failed on ${provider.id}/${model}`); // no request content in logs
      throw new ServiceError(provider.describeError(error), 502, retryable, records());
    }
    usage = addUsage(usage, res.usage);
    answeredBy = res.model || model;
    if (res.stopReason === "max_tokens") {
      lastIssue = "the answer was cut off by the length limit; be more economical";
      continue;
    }
    let parsed: unknown;
    try {
      parsed = parseJson(res.text);
    } catch {
      lastIssue = "it was not valid JSON";
      continue;
    }
    const checked = opts.schema.safeParse(parsed);
    if (checked.success) {
      return {
        data: checked.data,
        provider: provider.id,
        providerLabel: provider.label,
        model: answeredBy,
        isMock: !!provider.isMock,
        metaPrompt: { id: opts.meta.id, version: opts.meta.version },
        schemaVersion: opts.schemaVersion,
        usage: records(),
      };
    }
    lastIssue = checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  throw new ServiceError("The AI returned an answer in an unexpected shape. Try again.", 502, true, records());
}

/** Plain-text completion (Testing Lab). */
export async function runText(opts: { choice: ProviderChoice; system: string; user: string; maxTokens?: number }) {
  const { provider, model } = opts.choice;
  const started = Date.now();
  try {
    const res = await provider.complete({ model, system: opts.system, user: opts.user, maxTokens: opts.maxTokens ?? 8000, effort: "medium" });
    return {
      text: res.text,
      provider: provider.id,
      providerLabel: provider.label,
      isMock: !!provider.isMock,
      requestedModel: model,
      model: res.model || model,
      stopReason: res.stopReason,
      latencyMs: Date.now() - started,
      usage: res.usage,
      costUsd: estimateCost(provider.id, res.model || model, res.usage),
    };
  } catch (error) {
    throw new ServiceError(provider.describeError(error), 502, true, [
      { kind: "test", provider: provider.id, requestedModel: model, model, inputTokens: null, outputTokens: null, costUsd: null },
    ]);
  }
}
