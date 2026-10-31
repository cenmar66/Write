// Domain records and the storage interface. API routes talk only to DojoStore; the
// Supabase implementation enforces ownership with row-level security AND explicit
// user_id filters, the memory implementation (local demo / tests) scopes by user id.
import type { GenerationResult, TargetId } from "../schema";
import type { Profile, ProfileInput } from "../profiles";

export const VERSION_KINDS = ["generated", "alternative", "refined", "edited", "adapted", "imported", "restored", "analyzed", "template"] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];

export type PromptVersion = {
  id: string;
  prompt_id: string;
  version_no: number;
  content: string;
  kind: VersionKind;
  instruction: string;
  parent_version_id: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
};

export type NewVersion = Pick<PromptVersion, "content" | "kind"> & Partial<Pick<PromptVersion, "instruction" | "provider" | "model">>;

export type PromptRecord = {
  id: string;
  title: string;
  description: string;
  category: string;
  collection_id: string | null;
  target_model: TargetId;
  custom_target: string;
  favorite: boolean;
  archived_at: string | null;
  deleted_at: string | null;
  source: string;
  generation_id: string | null;
  tags: string[];
  content: string;
  version_count: number;
  created_at: string;
  updated_at: string;
};

export type PromptPatch = Partial<Pick<PromptRecord, "title" | "description" | "category" | "collection_id" | "target_model" | "custom_target" | "favorite" | "tags">> & {
  archived?: boolean;
};

export type NewPrompt = {
  title: string;
  description?: string;
  category?: string;
  collection_id?: string | null;
  target_model: TargetId;
  custom_target?: string;
  source: string;
  generation_id?: string | null;
  tags?: string[];
  favorite?: boolean;
  /** Oldest first. At least one. */
  versions: NewVersion[];
};

export type PromptFilter = {
  q?: string;
  target?: TargetId;
  category?: string;
  collection_id?: string;
  favorite?: boolean;
  view?: "active" | "archived" | "trash";
  sort?: "updated" | "created" | "title";
  limit?: number;
};

export type Collection = { id: string; name: string; created_at: string };

export type GenerationRecord = {
  id: string;
  request: string;
  target_model: TargetId;
  custom_target: string;
  provider: string;
  model: string;
  is_mock: boolean;
  meta_prompt_version: string;
  schema_version: string;
  profile_id: string | null;
  options: Record<string, unknown>;
  answers: { question: string; answer: string }[];
  result: GenerationResult;
  created_at: string;
};

export type NewGeneration = Omit<GenerationRecord, "id" | "created_at">;

export type CustomTemplate = {
  id: string;
  title: string;
  description: string;
  category: string;
  body: string;
  fields: { key: string; label: string; placeholder: string; help: string; required: boolean }[];
  created_at: string;
};
export type NewTemplate = Omit<CustomTemplate, "id" | "created_at">;

export type CriterionRating = { name: string; description: string; score: number | null; note: string };

export type TestRun = {
  id: string;
  prompt_id: string | null;
  version_id: string | null;
  prompt_text: string;
  variables: Record<string, string>;
  provider: string;
  model: string;
  is_mock: boolean;
  output: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  ratings: CriterionRating[];
  judge: unknown;
  created_at: string;
};
export type NewTestRun = Omit<TestRun, "id" | "created_at">;

export type AnalysisRecord = {
  id: string;
  prompt_text: string;
  provider: string;
  model: string;
  composite: number;
  result: unknown;
  created_at: string;
};
export type NewAnalysis = Omit<AnalysisRecord, "id" | "created_at">;

export type UsageEntry = {
  kind: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
};

export type UsageSummary = {
  since: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  unpricedRequests: number;
  byKind: Record<string, { requests: number; costUsd: number }>;
};

export type Preferences = {
  theme: "system" | "light" | "dark";
  accent: string;
  text_size: "sm" | "md" | "lg";
  default_target: TargetId;
  custom_target_name: string;
  custom_target_notes: string;
  provider: string;
  model: string;
  active_profile_id: string | null;
  clarify: boolean;
  retention_days: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  accent: "teal",
  text_size: "md",
  default_target: "universal",
  custom_target_name: "",
  custom_target_notes: "",
  provider: "",
  model: "",
  active_profile_id: null,
  clarify: true,
  retention_days: 0,
};

export interface DojoStore {
  readonly kind: "supabase" | "memory";

  getPreferences(): Promise<Preferences>;
  savePreferences(patch: Partial<Preferences>): Promise<Preferences>;

  listProfiles(): Promise<Profile[]>;
  getProfile(id: string): Promise<Profile | null>;
  saveProfile(input: ProfileInput, id?: string): Promise<Profile>;
  deleteProfile(id: string): Promise<void>;

  createGeneration(g: NewGeneration): Promise<GenerationRecord>;
  listGenerations(opts?: { q?: string; limit?: number }): Promise<GenerationRecord[]>;
  getGeneration(id: string): Promise<GenerationRecord | null>;
  deleteGeneration(id: string): Promise<void>;

  listPrompts(filter?: PromptFilter): Promise<PromptRecord[]>;
  getPrompt(id: string): Promise<(PromptRecord & { versions: PromptVersion[] }) | null>;
  createPrompt(p: NewPrompt): Promise<PromptRecord>;
  updatePrompt(id: string, patch: PromptPatch): Promise<PromptRecord | null>;
  addVersion(promptId: string, v: NewVersion & { parent_version_id?: string | null }): Promise<PromptVersion | null>;
  trashPrompt(id: string): Promise<void>;
  restorePrompt(id: string): Promise<void>;
  deletePromptForever(id: string): Promise<void>;

  listCollections(): Promise<Collection[]>;
  createCollection(name: string): Promise<Collection>;
  renameCollection(id: string, name: string): Promise<void>;
  deleteCollection(id: string): Promise<void>;

  listTemplates(): Promise<CustomTemplate[]>;
  createTemplate(t: NewTemplate): Promise<CustomTemplate>;
  deleteTemplate(id: string): Promise<void>;

  createTestRun(r: NewTestRun): Promise<TestRun>;
  listTestRuns(opts?: { promptId?: string; limit?: number }): Promise<TestRun[]>;
  deleteTestRun(id: string): Promise<void>;

  createAnalysis(a: NewAnalysis): Promise<AnalysisRecord>;
  listAnalyses(limit?: number): Promise<AnalysisRecord[]>;

  recordUsage(entries: UsageEntry[]): Promise<void>;
  usageSince(since: Date): Promise<UsageSummary>;

  /** Deletes generations, analyses and test runs older than N days. */
  applyRetention(days: number): Promise<number>;
  /** Removes every PromptDojo record for this user. */
  deleteAllData(): Promise<void>;
}

export function summarize(rows: (UsageEntry & { created_at?: string })[], since: Date): UsageSummary {
  const s: UsageSummary = { since: since.toISOString(), requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpricedRequests: 0, byKind: {} };
  for (const r of rows) {
    s.requests++;
    s.inputTokens += r.input_tokens ?? 0;
    s.outputTokens += r.output_tokens ?? 0;
    if (r.cost_usd === null || r.cost_usd === undefined) s.unpricedRequests++;
    else s.costUsd += Number(r.cost_usd);
    const k = (s.byKind[r.kind] ??= { requests: 0, costUsd: 0 });
    k.requests++;
    k.costUsd += Number(r.cost_usd ?? 0);
  }
  return s;
}
