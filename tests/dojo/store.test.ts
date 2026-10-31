// Library operations, version persistence and ownership boundaries, against the memory
// store (same interface as the Supabase store; database-level rules are covered by
// supabase/tests/dojo.test.sql).
import { beforeEach, describe, expect, it } from "vitest";
import { memoryStore, resetMemoryStore } from "@/lib/dojo/store";
import { validGeneration } from "./fixtures";

beforeEach(() => resetMemoryStore());

const newPrompt = (title: string, extra = {}) => ({
  title,
  target_model: "claude" as const,
  source: "generated",
  versions: [{ content: `${title} v1`, kind: "generated" as const }],
  ...extra,
});

describe("prompt library", () => {
  it("saves, edits, tags, favorites, archives, trashes and restores", async () => {
    const s = memoryStore("u1");
    const p = await s.createPrompt(newPrompt("Campaign", { tags: ["email", "email ", ""] }));
    expect(p.tags).toEqual(["email"]);
    expect(p.version_count).toBe(1);
    await s.updatePrompt(p.id, { title: "Spring campaign", description: "d", favorite: true, category: "Marketing" });
    expect((await s.listPrompts({ favorite: true }))[0].title).toBe("Spring campaign");
    await s.updatePrompt(p.id, { archived: true });
    expect(await s.listPrompts()).toHaveLength(0);
    expect(await s.listPrompts({ view: "archived" })).toHaveLength(1);
    await s.updatePrompt(p.id, { archived: false });
    await s.trashPrompt(p.id);
    expect(await s.listPrompts()).toHaveLength(0);
    expect(await s.listPrompts({ view: "trash" })).toHaveLength(1);
    await s.restorePrompt(p.id);
    expect(await s.listPrompts()).toHaveLength(1);
    await s.deletePromptForever(p.id);
    expect(await s.getPrompt(p.id)).toBeNull();
  });

  it("searches title, content and tags; filters by target and collection; sorts", async () => {
    const s = memoryStore("u1");
    const c = await s.createCollection("Construction");
    await s.createPrompt(newPrompt("Roof estimate", { collection_id: c.id }));
    await s.createPrompt({ ...newPrompt("Blog post"), target_model: "chatgpt", tags: ["seo"] });
    expect((await s.listPrompts({ q: "roof" })).map((p) => p.title)).toEqual(["Roof estimate"]);
    expect((await s.listPrompts({ q: "SEO" })).map((p) => p.title)).toEqual(["Blog post"]);
    expect((await s.listPrompts({ target: "chatgpt" })).map((p) => p.title)).toEqual(["Blog post"]);
    expect((await s.listPrompts({ collection_id: c.id })).map((p) => p.title)).toEqual(["Roof estimate"]);
    expect((await s.listPrompts({ sort: "title" })).map((p) => p.title)).toEqual(["Blog post", "Roof estimate"]);
    expect((await s.listPrompts({ sort: "created" }))[0].title).toBe("Blog post");
    await s.deleteCollection(c.id);
    expect((await s.listPrompts({ q: "roof" }))[0].collection_id).toBeNull();
  });

  it("keeps an append-only version history", async () => {
    const s = memoryStore("u1");
    const p = await s.createPrompt({ ...newPrompt("Email"), versions: [{ content: "a", kind: "generated" }, { content: "b", kind: "refined", instruction: "shorter" }] });
    const v3 = await s.addVersion(p.id, { content: "c", kind: "edited" });
    const full = await s.getPrompt(p.id);
    expect(full!.versions.map((v) => [v.version_no, v.content])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
    expect(v3!.parent_version_id).toBe(full!.versions[1].id);
    expect(full!.content).toBe("c");
    // "Reverting" adds a new version; old ones are never changed.
    await s.addVersion(p.id, { content: "a", kind: "restored" });
    const after = await s.getPrompt(p.id);
    expect(after!.versions).toHaveLength(4);
    expect(after!.versions[0].content).toBe("a");
    expect(after!.content).toBe("a");
  });

  it("isolates users from each other", async () => {
    const mine = memoryStore("u1");
    const theirs = memoryStore("u2");
    const p = await mine.createPrompt(newPrompt("Secret"));
    await mine.createGeneration({ request: "r", target_model: "claude", custom_target: "", provider: "mock", model: "mock-1", is_mock: true, meta_prompt_version: "generate.v1", schema_version: "dojo.generation.v1", profile_id: null, options: {}, answers: [], result: validGeneration() });
    expect(await theirs.listPrompts()).toHaveLength(0);
    expect(await theirs.getPrompt(p.id)).toBeNull();
    expect(await theirs.addVersion(p.id, { content: "x", kind: "edited" })).toBeNull();
    expect(await theirs.updatePrompt(p.id, { title: "hijack" })).toBeNull();
    expect(await theirs.listGenerations()).toHaveLength(0);
    expect((await mine.getPrompt(p.id))!.title).toBe("Secret");
  });

  it("records usage, applies retention and deletes all data", async () => {
    const s = memoryStore("u1");
    await s.recordUsage([{ kind: "generate", provider: "anthropic", model: "claude-opus-5-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.01 }, { kind: "test", provider: "openai", model: "x", input_tokens: 10, output_tokens: 10, cost_usd: null }]);
    const u = await s.usageSince(new Date(Date.now() - 60_000));
    expect(u).toMatchObject({ requests: 2, inputTokens: 110, unpricedRequests: 1 });
    expect(u.costUsd).toBeCloseTo(0.01);
    expect(await s.applyRetention(0)).toBe(0);
    await s.createPrompt(newPrompt("X"));
    await s.deleteAllData();
    expect(await s.listPrompts()).toHaveLength(0);
    expect((await s.usageSince(new Date(0))).requests).toBe(0);
  });

  it("stores profiles and clears the active one when deleted", async () => {
    const s = memoryStore("u1");
    const p = await s.saveProfile({ name: "Biz", tone: "", field: "", favorite_target: "", audience: "", response_format: "", language: "", prompt_length: "", custom_instructions: "" });
    await s.savePreferences({ active_profile_id: p.id });
    await s.deleteProfile(p.id);
    expect((await s.getPreferences()).active_profile_id).toBeNull();
  });
});
