// In-memory store for local demo mode and automated tests. Data lives in the server
// process and disappears on restart. Never used in production builds.
import { randomUUID } from "node:crypto";
import type { Profile, ProfileInput } from "../profiles";
import {
  DEFAULT_PREFERENCES,
  summarize,
  type AnalysisRecord,
  type Collection,
  type CustomTemplate,
  type DojoStore,
  type GenerationRecord,
  type Preferences,
  type PromptRecord,
  type PromptVersion,
  type TestRun,
  type UsageEntry,
} from "./types";

type PromptRow = Omit<PromptRecord, "content" | "version_count">;

type UserData = {
  prefs: Preferences;
  profiles: Profile[];
  generations: GenerationRecord[];
  prompts: PromptRow[];
  versions: PromptVersion[];
  collections: Collection[];
  templates: CustomTemplate[];
  runs: TestRun[];
  analyses: AnalysisRecord[];
  usage: (UsageEntry & { created_at: string })[];
};

const g = globalThis as unknown as { __dojoMemory?: Map<string, UserData> };
const DB = (g.__dojoMemory ??= new Map());

const now = () => new Date().toISOString();
// Monotonic timestamps so "newest first" is stable even within one millisecond.
let last = 0;
const stamp = () => {
  const t = Math.max(Date.now(), last + 1);
  last = t;
  return new Date(t).toISOString();
};

function data(userId: string): UserData {
  let d = DB.get(userId);
  if (!d) {
    d = { prefs: { ...DEFAULT_PREFERENCES }, profiles: [], generations: [], prompts: [], versions: [], collections: [], templates: [], runs: [], analyses: [], usage: [] };
    DB.set(userId, d);
  }
  return d;
}

/** Test helper: wipe everything. */
export function resetMemoryStore() {
  DB.clear();
}

export function memoryStore(userId: string): DojoStore {
  const d = () => data(userId);

  const hydrate = (p: PromptRow): PromptRecord => {
    const vs = d().versions.filter((v) => v.prompt_id === p.id);
    const latest = vs.reduce<PromptVersion | null>((a, v) => (!a || v.version_no > a.version_no ? v : a), null);
    return { ...p, content: latest?.content ?? "", version_count: vs.length };
  };
  const row = (id: string) => d().prompts.find((p) => p.id === id);

  return {
    kind: "memory",

    async getPreferences() {
      return { ...d().prefs };
    },
    async savePreferences(patch) {
      d().prefs = { ...d().prefs, ...patch };
      return { ...d().prefs };
    },

    async listProfiles() {
      return [...d().profiles];
    },
    async getProfile(id) {
      return d().profiles.find((p) => p.id === id) ?? null;
    },
    async saveProfile(input: ProfileInput, id) {
      const list = d().profiles;
      const existing = id ? list.find((p) => p.id === id) : undefined;
      if (existing) {
        Object.assign(existing, input);
        return existing;
      }
      const p: Profile = { ...input, id: randomUUID() };
      list.push(p);
      return p;
    },
    async deleteProfile(id) {
      d().profiles = d().profiles.filter((p) => p.id !== id);
      if (d().prefs.active_profile_id === id) d().prefs.active_profile_id = null;
    },

    async createGeneration(gen) {
      const rec: GenerationRecord = { ...gen, id: randomUUID(), created_at: stamp() };
      d().generations.unshift(rec);
      return rec;
    },
    async listGenerations({ q, limit = 50 } = {}) {
      const needle = q?.toLowerCase();
      return d()
        .generations.filter((x) => !needle || x.request.toLowerCase().includes(needle) || x.result.recommended.title.toLowerCase().includes(needle))
        .slice(0, limit);
    },
    async getGeneration(id) {
      return d().generations.find((x) => x.id === id) ?? null;
    },
    async deleteGeneration(id) {
      d().generations = d().generations.filter((x) => x.id !== id);
    },

    async listPrompts(f = {}) {
      const view = f.view ?? "active";
      const needle = f.q?.toLowerCase().trim();
      let list = d().prompts.map(hydrate).filter((p) => {
        if (view === "trash" ? !p.deleted_at : p.deleted_at) return false;
        if (view === "archived" ? !p.archived_at : view === "active" && p.archived_at) return false;
        if (f.target && p.target_model !== f.target) return false;
        if (f.category && p.category !== f.category) return false;
        if (f.collection_id && p.collection_id !== f.collection_id) return false;
        if (f.favorite && !p.favorite) return false;
        if (needle && ![p.title, p.description, p.content, p.category, ...p.tags].some((s) => s.toLowerCase().includes(needle))) return false;
        return true;
      });
      const sort = f.sort ?? "updated";
      list = list.sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : sort === "created" ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at)));
      return list.slice(0, f.limit ?? 500);
    },
    async getPrompt(id) {
      const p = row(id);
      if (!p) return null;
      const versions = d().versions.filter((v) => v.prompt_id === id).sort((a, b) => a.version_no - b.version_no);
      return { ...hydrate(p), versions };
    },
    async createPrompt(input) {
      const t = stamp();
      const p: PromptRow = {
        id: randomUUID(),
        title: input.title,
        description: input.description ?? "",
        category: input.category ?? "",
        collection_id: input.collection_id ?? null,
        target_model: input.target_model,
        custom_target: input.custom_target ?? "",
        favorite: input.favorite ?? false,
        archived_at: null,
        deleted_at: null,
        source: input.source,
        generation_id: input.generation_id ?? null,
        tags: [...new Set((input.tags ?? []).map((x) => x.trim()).filter(Boolean))],
        created_at: t,
        updated_at: t,
      };
      d().prompts.push(p);
      let parent: string | null = null;
      input.versions.forEach((v, i) => {
        const ver: PromptVersion = { id: randomUUID(), prompt_id: p.id, version_no: i + 1, content: v.content, kind: v.kind, instruction: v.instruction ?? "", parent_version_id: parent, provider: v.provider ?? null, model: v.model ?? null, created_at: stamp() };
        parent = ver.id;
        d().versions.push(ver);
      });
      return hydrate(p);
    },
    async updatePrompt(id, patch) {
      const p = row(id);
      if (!p) return null;
      const { archived, tags, ...rest } = patch;
      Object.assign(p, rest);
      if (tags) p.tags = [...new Set(tags.map((x) => x.trim()).filter(Boolean))];
      if (archived !== undefined) p.archived_at = archived ? now() : null;
      p.updated_at = stamp();
      return hydrate(p);
    },
    async addVersion(promptId, v) {
      const p = row(promptId);
      if (!p) return null;
      const vs = d().versions.filter((x) => x.prompt_id === promptId);
      const latest = vs.reduce<PromptVersion | null>((a, x) => (!a || x.version_no > a.version_no ? x : a), null);
      const ver: PromptVersion = {
        id: randomUUID(),
        prompt_id: promptId,
        version_no: (latest?.version_no ?? 0) + 1,
        content: v.content,
        kind: v.kind,
        instruction: v.instruction ?? "",
        parent_version_id: v.parent_version_id ?? latest?.id ?? null,
        provider: v.provider ?? null,
        model: v.model ?? null,
        created_at: stamp(),
      };
      d().versions.push(ver);
      p.updated_at = stamp();
      return ver;
    },
    async trashPrompt(id) {
      const p = row(id);
      if (p) p.deleted_at = now();
    },
    async restorePrompt(id) {
      const p = row(id);
      if (p) p.deleted_at = null;
    },
    async deletePromptForever(id) {
      d().prompts = d().prompts.filter((p) => p.id !== id);
      d().versions = d().versions.filter((v) => v.prompt_id !== id);
    },

    async listCollections() {
      return [...d().collections].sort((a, b) => a.name.localeCompare(b.name));
    },
    async createCollection(name) {
      const c = { id: randomUUID(), name, created_at: now() };
      d().collections.push(c);
      return c;
    },
    async renameCollection(id, name) {
      const c = d().collections.find((x) => x.id === id);
      if (c) c.name = name;
    },
    async deleteCollection(id) {
      d().collections = d().collections.filter((c) => c.id !== id);
      d().prompts.forEach((p) => {
        if (p.collection_id === id) p.collection_id = null;
      });
    },

    async listTemplates() {
      return [...d().templates];
    },
    async createTemplate(t) {
      const rec = { ...t, id: randomUUID(), created_at: stamp() };
      d().templates.unshift(rec);
      return rec;
    },
    async deleteTemplate(id) {
      d().templates = d().templates.filter((t) => t.id !== id);
    },

    async createTestRun(r) {
      const rec = { ...r, id: randomUUID(), created_at: stamp() };
      d().runs.unshift(rec);
      return rec;
    },
    async listTestRuns({ promptId, limit = 50 } = {}) {
      return d()
        .runs.filter((r) => !promptId || r.prompt_id === promptId)
        .slice(0, limit);
    },
    async deleteTestRun(id) {
      d().runs = d().runs.filter((r) => r.id !== id);
    },

    async createAnalysis(a) {
      const rec = { ...a, id: randomUUID(), created_at: stamp() };
      d().analyses.unshift(rec);
      return rec;
    },
    async listAnalyses(limit = 30) {
      return d().analyses.slice(0, limit);
    },

    async recordUsage(entries) {
      d().usage.push(...entries.map((e) => ({ ...e, created_at: now() })));
    },
    async usageSince(since) {
      return summarize(
        d().usage.filter((u) => u.created_at >= since.toISOString()),
        since,
      );
    },

    async applyRetention(days) {
      if (!days) return 0;
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const before = d().generations.length + d().analyses.length + d().runs.length;
      d().generations = d().generations.filter((x) => x.created_at >= cutoff);
      d().analyses = d().analyses.filter((x) => x.created_at >= cutoff);
      d().runs = d().runs.filter((x) => x.created_at >= cutoff);
      return before - (d().generations.length + d().analyses.length + d().runs.length);
    },
    async deleteAllData() {
      DB.delete(userId);
    },
  };
}
