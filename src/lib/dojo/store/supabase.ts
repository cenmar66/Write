// Supabase-backed store. Row-level security limits every query to the signed-in user;
// queries also filter on user_id explicitly so a policy mistake can't widen access.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "../profiles";
import type { GenerationResult } from "../schema";
import {
  DEFAULT_PREFERENCES,
  summarize,
  type Collection,
  type DojoStore,
  type GenerationRecord,
  type Preferences,
  type PromptRecord,
  type PromptVersion,
} from "./types";

type Row = Record<string, unknown>;

function fail(error: { message: string } | null, what: string): void {
  if (error) {
    console.error(`[dojo] database error: ${what}`); // message may contain data; keep logs content-free
    throw new Error(`Couldn't ${what}. Check that the PromptDojo database update (0011) has been run.`);
  }
}

const PROMPT_FIELDS = "id,title,description,category,collection_id,target_model,custom_target,favorite,archived_at,deleted_at,source,generation_id,current_version_no,current_content,created_at,updated_at,dojo_prompt_tags(dojo_tags(name))";
const PROFILE_FIELDS = "id,name,tone,field,favorite_target,audience,response_format,language,prompt_length,custom_instructions";

function toPrompt(r: Row): PromptRecord {
  const links = (r.dojo_prompt_tags as { dojo_tags: { name: string } | null }[] | null) ?? [];
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as string,
    collection_id: (r.collection_id as string) ?? null,
    target_model: r.target_model as PromptRecord["target_model"],
    custom_target: r.custom_target as string,
    favorite: r.favorite as boolean,
    archived_at: (r.archived_at as string) ?? null,
    deleted_at: (r.deleted_at as string) ?? null,
    source: r.source as string,
    generation_id: (r.generation_id as string) ?? null,
    tags: links.map((l) => l.dojo_tags?.name).filter((n): n is string => !!n),
    content: r.current_content as string,
    version_count: r.current_version_no as number,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function toGeneration(r: Row): GenerationRecord {
  const alts = ((r.dojo_alternatives as Row[] | null) ?? []).sort((a, b) => (a.position as number) - (b.position as number));
  const result = { ...(r.result as object), alternatives: alts.map((a) => ({ kind: a.kind, title: a.title, approach: a.approach, prompt: a.prompt })) } as GenerationResult;
  return {
    id: r.id as string,
    request: r.request as string,
    target_model: r.target_model as GenerationRecord["target_model"],
    custom_target: r.custom_target as string,
    provider: r.provider as string,
    model: r.model as string,
    is_mock: r.is_mock as boolean,
    meta_prompt_version: r.meta_prompt_version as string,
    schema_version: r.schema_version as string,
    profile_id: (r.profile_id as string) ?? null,
    options: (r.options as Record<string, unknown>) ?? {},
    answers: (r.answers as GenerationRecord["answers"]) ?? [],
    result,
    created_at: r.created_at as string,
  };
}

/** Strips PostgREST filter syntax from a search term. */
const searchTerm = (q: string) => q.replace(/[,()*%\\]/g, " ").trim().slice(0, 100);

export function supabaseStore(supabase: SupabaseClient, userId: string): DojoStore {
  // Adds the explicit owner filter. Typed loosely: PostgREST's builder generics are too
  // deep for TypeScript to follow through a helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const own = (q: any): any => q.eq("user_id", userId);

  async function setTags(promptId: string, names: string[]) {
    const wanted = [...new Map(names.map((n) => n.trim().slice(0, 40)).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()];
    const { data: existing, error } = await own(supabase.from("dojo_tags").select("id,name"));
    fail(error, "load tags");
    const byName = new Map((existing ?? []).map((t: Row) => [String(t.name).toLowerCase(), t.id as string]));
    const missing = wanted.filter((n) => !byName.has(n.toLowerCase()));
    if (missing.length) {
      const { data: created, error: e2 } = await supabase.from("dojo_tags").insert(missing.map((name) => ({ name, user_id: userId }))).select("id,name");
      fail(e2, "create tags");
      (created ?? []).forEach((t) => byName.set(String(t.name).toLowerCase(), t.id as string));
    }
    const { error: e3 } = await own(supabase.from("dojo_prompt_tags").delete().eq("prompt_id", promptId));
    fail(e3, "update tags");
    if (wanted.length) {
      const { error: e4 } = await supabase.from("dojo_prompt_tags").insert(wanted.map((n) => ({ prompt_id: promptId, tag_id: byName.get(n.toLowerCase()), user_id: userId })));
      fail(e4, "update tags");
    }
  }

  async function latestVersionId(promptId: string): Promise<string | null> {
    const { data } = await own(supabase.from("dojo_prompt_versions").select("id").eq("prompt_id", promptId)).order("version_no", { ascending: false }).limit(1).maybeSingle();
    return (data?.id as string) ?? null;
  }

  const store: DojoStore = {
    kind: "supabase",

    async getPreferences() {
      const { data, error } = await own(supabase.from("dojo_preferences").select("*")).maybeSingle();
      fail(error, "load settings");
      if (!data) return { ...DEFAULT_PREFERENCES };
      const keys = Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[];
      return Object.fromEntries(keys.map((k) => [k, data[k] ?? DEFAULT_PREFERENCES[k]])) as Preferences;
    },
    async savePreferences(patch) {
      const current = await store.getPreferences();
      const next = { ...current, ...patch };
      const { error } = await supabase.from("dojo_preferences").upsert({ ...next, user_id: userId }, { onConflict: "user_id" });
      fail(error, "save settings");
      return next;
    },

    async listProfiles() {
      const { data, error } = await own(supabase.from("dojo_profiles").select(PROFILE_FIELDS)).order("name");
      fail(error, "load profiles");
      return (data ?? []) as Profile[];
    },
    async getProfile(id) {
      const { data } = await own(supabase.from("dojo_profiles").select(PROFILE_FIELDS).eq("id", id)).maybeSingle();
      return (data as Profile) ?? null;
    },
    async saveProfile(input, id) {
      const q = id
        ? own(supabase.from("dojo_profiles").update(input).eq("id", id)).select(PROFILE_FIELDS).single()
        : supabase.from("dojo_profiles").insert({ ...input, user_id: userId }).select(PROFILE_FIELDS).single();
      const { data, error } = await q;
      fail(error, "save the profile");
      return data as Profile;
    },
    async deleteProfile(id) {
      const { error } = await own(supabase.from("dojo_profiles").delete().eq("id", id));
      fail(error, "delete the profile");
    },

    async createGeneration(g) {
      const { alternatives, ...rest } = g.result;
      const { data, error } = await supabase
        .from("dojo_generations")
        .insert({ ...g, result: rest, user_id: userId })
        .select("*")
        .single();
      fail(error, "save the generation");
      const { error: e2 } = await supabase
        .from("dojo_alternatives")
        .insert(alternatives.map((a, position) => ({ ...a, position, generation_id: data!.id, user_id: userId })));
      fail(e2, "save the alternatives");
      return toGeneration({ ...data!, dojo_alternatives: alternatives.map((a, position) => ({ ...a, position })) });
    },
    async listGenerations({ q, limit = 50 } = {}) {
      let query = own(supabase.from("dojo_generations").select("*,dojo_alternatives(*)"));
      const term = q ? searchTerm(q) : "";
      if (term) query = query.ilike("request", `%${term}%`);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
      fail(error, "load history");
      return (data ?? []).map(toGeneration);
    },
    async getGeneration(id) {
      const { data } = await own(supabase.from("dojo_generations").select("*,dojo_alternatives(*)").eq("id", id)).maybeSingle();
      return data ? toGeneration(data) : null;
    },
    async deleteGeneration(id) {
      const { error } = await own(supabase.from("dojo_generations").delete().eq("id", id));
      fail(error, "delete the generation");
    },

    async listPrompts(f = {}) {
      let q = own(supabase.from("dojo_prompts").select(PROMPT_FIELDS));
      const view = f.view ?? "active";
      q = view === "trash" ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      if (view === "archived") q = q.not("archived_at", "is", null);
      if (view === "active") q = q.is("archived_at", null);
      if (f.target) q = q.eq("target_model", f.target);
      if (f.category) q = q.eq("category", f.category);
      if (f.collection_id) q = q.eq("collection_id", f.collection_id);
      if (f.favorite) q = q.eq("favorite", true);
      const term = f.q ? searchTerm(f.q) : "";
      if (term) {
        const { data: tagged } = await own(supabase.from("dojo_prompt_tags").select("prompt_id,dojo_tags!inner(name)").ilike("dojo_tags.name", `%${term}%`));
        const ids = (tagged ?? []).map((t: Row) => t.prompt_id as string);
        const or = [`title.ilike.%${term}%`, `description.ilike.%${term}%`, `current_content.ilike.%${term}%`, `category.ilike.%${term}%`];
        if (ids.length) or.push(`id.in.(${ids.join(",")})`);
        q = q.or(or.join(","));
      }
      const sort = f.sort ?? "updated";
      q = sort === "title" ? q.order("title") : q.order(sort === "created" ? "created_at" : "updated_at", { ascending: false });
      const { data, error } = await q.limit(f.limit ?? 500);
      fail(error, "load the library");
      return (data ?? []).map(toPrompt);
    },
    async getPrompt(id) {
      const { data } = await own(supabase.from("dojo_prompts").select(PROMPT_FIELDS).eq("id", id)).maybeSingle();
      if (!data) return null;
      const { data: versions, error } = await own(supabase.from("dojo_prompt_versions").select("*").eq("prompt_id", id)).order("version_no");
      fail(error, "load versions");
      return { ...toPrompt(data), versions: (versions ?? []) as PromptVersion[] };
    },
    async createPrompt(p) {
      const { data, error } = await supabase
        .from("dojo_prompts")
        .insert({
          title: p.title,
          description: p.description ?? "",
          category: p.category ?? "",
          collection_id: p.collection_id ?? null,
          target_model: p.target_model,
          custom_target: p.custom_target ?? "",
          source: p.source,
          generation_id: p.generation_id ?? null,
          favorite: p.favorite ?? false,
          user_id: userId,
        })
        .select("id")
        .single();
      fail(error, "save the prompt");
      const id = data!.id as string;
      let parent: string | null = null;
      for (const v of p.versions) {
        const ver = await store.addVersion(id, { ...v, parent_version_id: parent });
        parent = ver?.id ?? parent;
      }
      if (p.tags?.length) await setTags(id, p.tags);
      return (await store.getPrompt(id))!;
    },
    async updatePrompt(id, patch) {
      const { archived, tags, ...rest } = patch;
      const update: Row = { ...rest };
      if (archived !== undefined) update.archived_at = archived ? new Date().toISOString() : null;
      if (Object.keys(update).length) {
        const { error } = await own(supabase.from("dojo_prompts").update(update).eq("id", id));
        fail(error, "update the prompt");
      }
      if (tags) await setTags(id, tags);
      const p = await store.getPrompt(id);
      if (!p) return null;
      const { versions: _versions, ...rec } = p;
      void _versions;
      return rec;
    },
    async addVersion(promptId, v) {
      const parent = v.parent_version_id !== undefined ? v.parent_version_id : await latestVersionId(promptId);
      const { data, error } = await supabase
        .from("dojo_prompt_versions")
        .insert({ prompt_id: promptId, version_no: 0, content: v.content, kind: v.kind, instruction: v.instruction ?? "", parent_version_id: parent, provider: v.provider ?? null, model: v.model ?? null, user_id: userId })
        .select("*")
        .single();
      if (error) {
        if (/Prompt not found|row-level security/i.test(error.message)) return null;
        fail(error, "save the version");
      }
      if (v.kind === "refined" || v.kind === "adapted") {
        await supabase.from("dojo_refinements").insert({ prompt_id: promptId, from_version_id: parent, to_version_id: data!.id, action: v.kind, instruction: v.instruction ?? "", provider: v.provider ?? null, model: v.model ?? null, user_id: userId });
      }
      return data as PromptVersion;
    },
    async trashPrompt(id) {
      const { error } = await own(supabase.from("dojo_prompts").update({ deleted_at: new Date().toISOString() }).eq("id", id));
      fail(error, "move the prompt to the trash");
    },
    async restorePrompt(id) {
      const { error } = await own(supabase.from("dojo_prompts").update({ deleted_at: null }).eq("id", id));
      fail(error, "restore the prompt");
    },
    async deletePromptForever(id) {
      const { error } = await own(supabase.from("dojo_prompts").delete().eq("id", id));
      fail(error, "delete the prompt");
    },

    async listCollections() {
      const { data, error } = await own(supabase.from("dojo_collections").select("id,name,created_at")).order("name");
      fail(error, "load collections");
      return (data ?? []) as Collection[];
    },
    async createCollection(name) {
      const { data, error } = await supabase.from("dojo_collections").insert({ name, user_id: userId }).select("id,name,created_at").single();
      if (error && /duplicate|unique/i.test(error.message)) throw new Error("A collection with that name already exists.");
      fail(error, "create the collection");
      return data as { id: string; name: string; created_at: string };
    },
    async renameCollection(id, name) {
      const { error } = await own(supabase.from("dojo_collections").update({ name }).eq("id", id));
      fail(error, "rename the collection");
    },
    async deleteCollection(id) {
      const { error } = await own(supabase.from("dojo_collections").delete().eq("id", id));
      fail(error, "delete the collection");
    },

    async listTemplates() {
      const { data, error } = await own(supabase.from("dojo_templates").select("*")).order("created_at", { ascending: false });
      fail(error, "load templates");
      return (data ?? []) as never;
    },
    async createTemplate(t) {
      const { data, error } = await supabase.from("dojo_templates").insert({ ...t, user_id: userId }).select("*").single();
      fail(error, "save the template");
      return data as never;
    },
    async deleteTemplate(id) {
      const { error } = await own(supabase.from("dojo_templates").delete().eq("id", id));
      fail(error, "delete the template");
    },

    async createTestRun(r) {
      const { data, error } = await supabase.from("dojo_test_runs").insert({ ...r, user_id: userId }).select("*").single();
      fail(error, "save the test run");
      return data as never;
    },
    async listTestRuns({ promptId, limit = 50 } = {}) {
      let q = own(supabase.from("dojo_test_runs").select("*"));
      if (promptId) q = q.eq("prompt_id", promptId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
      fail(error, "load test runs");
      return (data ?? []).map((r: Row) => ({ ...r, cost_usd: r.cost_usd === null ? null : Number(r.cost_usd) })) as never;
    },
    async deleteTestRun(id) {
      const { error } = await own(supabase.from("dojo_test_runs").delete().eq("id", id));
      fail(error, "delete the test run");
    },

    async createAnalysis(a) {
      const { data, error } = await supabase.from("dojo_analyses").insert({ ...a, user_id: userId }).select("*").single();
      fail(error, "save the analysis");
      return data as never;
    },
    async listAnalyses(limit = 30) {
      const { data, error } = await own(supabase.from("dojo_analyses").select("*")).order("created_at", { ascending: false }).limit(limit);
      fail(error, "load analyses");
      return (data ?? []) as never;
    },

    async recordUsage(entries) {
      if (!entries.length) return;
      const { error } = await supabase.from("dojo_usage").insert(entries.map((e) => ({ ...e, user_id: userId })));
      if (error) console.error("[dojo] couldn't record usage");
    },
    async usageSince(since) {
      const { data, error } = await own(supabase.from("dojo_usage").select("kind,provider,model,input_tokens,output_tokens,cost_usd,created_at")).gte("created_at", since.toISOString()).limit(20000);
      fail(error, "load usage");
      return summarize((data ?? []).map((r: Row) => ({ ...r, cost_usd: r.cost_usd === null ? null : Number(r.cost_usd) })) as never, since);
    },

    async applyRetention(days) {
      const { data, error } = await supabase.rpc("dojo_apply_retention", { days });
      fail(error, "apply data retention");
      return (data as number) ?? 0;
    },
    async deleteAllData() {
      const { error } = await supabase.rpc("dojo_delete_my_data");
      fail(error, "delete your data");
    },
  };
  return store;
}
