import { PROVIDERS } from "@/lib/ai/providers";
import { loadAiSettings, requireOwner } from "@/lib/ai/server";
import {
  draftPrompt,
  EXTRACT_SYSTEM,
  FIT_SCHEMA,
  fitPrompt,
  normalizePosts,
  POSTS_SCHEMA,
  repurposePrompt,
  TEMPLATE_SCHEMA,
} from "@/lib/social/ai";
import { PLATFORM_IDS, PLATFORMS, type PlatformId, type PostFormat } from "@/lib/social/platforms";
import { findTemplate, MAX_REPURPOSE_TEMPLATES, type PostTemplate } from "@/lib/social/templates";

const formatOf = (f: unknown): PostFormat => (f === "thread" || f === "carousel" ? f : "single");

export const maxDuration = 300;

type Body = {
  mode?: "draft" | "repurpose" | "fit" | "extract_template";
  idea?: string;
  templateKey?: string;
  customTemplate?: Pick<PostTemplate, "name" | "structure" | "example" | "format">;
  platforms?: string[];
  documentId?: string;
  perPlatform?: number;
  templateKeys?: unknown;
  platform?: string;
  text?: string;
  example?: string;
  styleId?: string;
};

const bad = (error: string) => Response.json({ error }, { status: 400 });

export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { supabase } = auth;
  const body = (await request.json()) as Body;
  const { model, voice } = await loadAiSettings(supabase, { styleId: body.styleId, documentId: body.documentId });
  const provider = PROVIDERS[model.provider];
  const platforms = (body.platforms ?? []).filter((p): p is PlatformId => PLATFORM_IDS.includes(p as PlatformId));

  const run = (system: string, user: string, schema: Record<string, unknown>, effort: "low" | "medium" = "medium") =>
    provider.generateJson({ model, system, messages: [{ role: "user", content: user }], effort, maxTokens: 16000 }, schema);

  try {
    switch (body.mode) {
      case "draft": {
        if (!body.idea?.trim()) return bad("Add your idea first.");
        if (!platforms.length) return bad("Pick at least one platform.");
        const template: PostTemplate | undefined = body.customTemplate
          ? { key: "custom", category: "mine", description: "", bestFor: PLATFORM_IDS, ...body.customTemplate }
          : findTemplate(body.templateKey ?? "free");
        if (!template) return bad("Unknown template.");
        const { system, user } = draftPrompt({ template, idea: body.idea, platforms, voice });
        return Response.json({ posts: normalizePosts(await run(system, user, POSTS_SCHEMA), platforms) });
      }
      case "repurpose": {
        if (!body.documentId) return bad("Pick a document.");
        if (!platforms.length) return bad("Pick at least one platform.");
        const { data: doc } = await supabase.from("documents").select("title,content_text").eq("id", body.documentId).maybeSingle();
        if (!doc?.content_text?.trim()) return bad("That document is empty.");
        const perPlatform = Math.min(Math.max(body.perPlatform ?? 1, 1), 3);
        // Templates the author picked: built-in keys, or "custom:<id>" for their own (RLS keeps it to theirs).
        const keys = (Array.isArray(body.templateKeys) ? body.templateKeys : []).filter((k): k is string => typeof k === "string").slice(0, MAX_REPURPOSE_TEMPLATES);
        const customIds = keys.filter((k) => k.startsWith("custom:")).map((k) => k.slice(7));
        const { data: custom } = customIds.length
          ? await supabase.from("post_templates").select("id,name,description,structure,example,format").in("id", customIds)
          : { data: [] };
        const templates = keys
          .map((k): PostTemplate | undefined => {
            if (!k.startsWith("custom:")) return findTemplate(k);
            const row = custom?.find((c) => c.id === k.slice(7));
            return row
              ? { key: k, name: row.name, category: "mine", description: row.description ?? "", structure: row.structure, example: row.example ?? "", format: formatOf(row.format), bestFor: PLATFORM_IDS }
              : undefined;
          })
          .filter((t): t is PostTemplate => !!t);
        if (keys.length && !templates.length) return bad("Those templates couldn't be found.");
        const { system, user } = repurposePrompt({ title: doc.title, document: doc.content_text, platforms, perPlatform, voice, templates });
        return Response.json({ posts: normalizePosts(await run(system, user, POSTS_SCHEMA), platforms) });
      }
      case "fit": {
        const platform = body.platform as PlatformId;
        if (!PLATFORM_IDS.includes(platform) || !body.text?.trim()) return bad("Nothing to shorten.");
        const { system, user } = fitPrompt({ platform, text: body.text, limit: PLATFORMS[platform].limit, voice });
        const raw = (await run(system, user, FIT_SCHEMA, "low")) as { content?: string };
        return Response.json({ content: (raw.content ?? "").trim() });
      }
      case "extract_template": {
        if (!body.example?.trim()) return bad("Paste a post first.");
        const raw = await run(EXTRACT_SYSTEM, `Turn this post into a reusable template:\n\n<post>\n${body.example}\n</post>`, TEMPLATE_SCHEMA, "low");
        return Response.json({ template: raw });
      }
      default:
        return bad("Unknown request.");
    }
  } catch (error) {
    console.error("Post generation failed", error);
    return Response.json({ error: provider.describeError(error) }, { status: 502 });
  }
}
