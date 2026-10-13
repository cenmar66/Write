import { PLATFORM_IDS, PLATFORMS, type PlatformId, type PostFormat } from "./platforms";
import { TEMPLATES, type PostTemplate } from "./templates";

// Shapes and prompts for generating social posts.

export type GeneratedPost = {
  platform: PlatformId;
  format: PostFormat;
  angle: string;
  template: string;
  content: string;
  parts: string[];
  hashtags: string[];
};

const POST_ITEM = {
  type: "object",
  properties: {
    platform: { type: "string", enum: PLATFORM_IDS },
    format: { type: "string", enum: ["single", "thread", "carousel"] },
    angle: { type: "string", description: "A few words naming this post's angle." },
    template: { type: "string", description: "The template key used, or 'free'." },
    content: { type: "string", description: "The full post text for single posts, or the caption for carousels. Empty for threads." },
    parts: { type: "array", items: { type: "string" }, description: "Thread posts or carousel slides, in order. Empty for single posts." },
    hashtags: { type: "array", items: { type: "string" }, description: "Suggested hashtags without the # sign." },
  },
  required: ["platform", "format", "angle", "template", "content", "parts", "hashtags"],
  additionalProperties: false,
} as const;

export const POSTS_SCHEMA = {
  type: "object",
  properties: { posts: { type: "array", items: POST_ITEM } },
  required: ["posts"],
  additionalProperties: false,
} as const;

export const FIT_SCHEMA = {
  type: "object",
  properties: { content: { type: "string" } },
  required: ["content"],
  additionalProperties: false,
} as const;

export const TEMPLATE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "A short, catchy template name (2-4 words)." },
    description: { type: "string", description: "One sentence on when to use it." },
    structure: { type: "string", description: "Step-by-step instructions to recreate this structure with any topic." },
    format: { type: "string", enum: ["single", "thread", "carousel"] },
  },
  required: ["name", "description", "structure", "format"],
  additionalProperties: false,
} as const;

function platformRules(platforms: PlatformId[]): string {
  return platforms
    .map((id) => {
      const p = PLATFORMS[id];
      return `- ${p.label} (${id}): max ${p.limit} characters per post. Formats allowed: ${p.formats.join(", ")}. Up to ${p.maxHashtags} hashtag suggestions. ${p.guidance}`;
    })
    .join("\n");
}

function base(voice: string, platforms: PlatformId[]): string {
  return [
    `You are a top social media writer. You write posts people stop scrolling for: specific, human, and useful. Never generic, never clickbait you can't back up.
Write in the language of the idea or source (English or Spanish).
Never put hashtags inside content or parts; put them only in the hashtags list.
For carousels, put the slide texts in parts and the post caption in content.
Respect every character limit strictly, counting carefully.`,
    voice,
    `Platform rules:\n${platformRules(platforms)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Picks the template's format when the platform supports it, otherwise a single post. */
export function formatFor(platform: PlatformId, wanted: PostFormat): PostFormat {
  return PLATFORMS[platform].formats.includes(wanted) ? wanted : "single";
}

export function draftPrompt(opts: { template: PostTemplate; idea: string; platforms: PlatformId[]; voice: string }) {
  const wanted = opts.platforms.map((p) => `- ${p}: ${formatFor(p, opts.template.format)}`).join("\n");
  return {
    system: base(opts.voice, opts.platforms),
    user: `Write one post per platform using this template.

<template name="${opts.template.name}" key="${opts.template.key}">
${opts.template.structure}
${opts.template.example ? `Example of the feel (do not copy it): ${opts.template.example}` : ""}
</template>

<idea>
${opts.idea}
</idea>

Platforms and formats:
${wanted}`,
  };
}

export function repurposePrompt(opts: { title: string; document: string; platforms: PlatformId[]; perPlatform: number; voice: string }) {
  const catalog = TEMPLATES.map((t) => `- ${t.key} (${t.format}): ${t.name}. ${t.description}`).join("\n");
  return {
    system: base(opts.voice, opts.platforms),
    user: `Turn this document into ${opts.perPlatform * opts.platforms.length} social posts: ${opts.perPlatform} for each of these platforms: ${opts.platforms.join(", ")}.
Give every post a different angle (a key insight, a story, a list, a contrarian point, a how-to). Pick the best template for each from the catalog and use a thread or carousel where the platform allows and it suits the material. Each post must stand on its own for someone who hasn't read the document.

Template catalog:
${catalog}

<document title="${opts.title.replace(/"/g, "'")}">
${opts.document}
</document>`,
  };
}

export function fitPrompt(opts: { platform: PlatformId; text: string; limit: number; voice: string }) {
  return {
    system: base(opts.voice, [opts.platform]),
    user: `This ${PLATFORMS[opts.platform].label} post is too long. Rewrite it to fit within ${opts.limit} characters (aim for about ${Math.floor(opts.limit * 0.9)}), keeping the hook, the key point, and the voice.\n\n<post>\n${opts.text}\n</post>`,
  };
}

export const EXTRACT_SYSTEM = `You study social media posts and turn their structure into reusable templates. Describe the structure, not the topic, so it works for any subject. Write the template in English.`;

/** Cleans up the model's output so the UI can trust it. */
export function normalizePosts(raw: unknown, allowed: PlatformId[]): GeneratedPost[] {
  const list = ((raw as { posts?: unknown[] })?.posts ?? []) as Partial<GeneratedPost>[];
  return list
    .filter((p) => p && allowed.includes(p.platform as PlatformId))
    .map((p) => {
      const platform = p.platform as PlatformId;
      let format = formatFor(platform, (p.format as PostFormat) ?? "single");
      let parts = (p.parts ?? []).map((s) => String(s).trim()).filter(Boolean);
      let content = String(p.content ?? "").trim();
      if (format === "single") {
        if (!content && parts.length) content = parts.join("\n\n");
        parts = [];
      } else if (!parts.length) {
        format = "single";
      } else if (format === "thread") {
        content = "";
      }
      const hashtags = Array.from(
        new Set((p.hashtags ?? []).map((h) => String(h).replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean)),
      ).slice(0, PLATFORMS[platform].maxHashtags);
      return {
        platform,
        format,
        angle: String(p.angle ?? "").trim(),
        template: String(p.template ?? "free"),
        content,
        parts,
        hashtags,
      };
    });
}
