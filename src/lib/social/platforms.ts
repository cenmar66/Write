// Platform rules: character limits and writing guidance. Limits checked October 2026.

export type PlatformId = "linkedin" | "x" | "threads" | "facebook" | "instagram";
export type PostFormat = "single" | "thread" | "carousel";

export type Platform = {
  id: PlatformId;
  label: string;
  /** Max characters per post (or per thread part). */
  limit: number;
  /** Characters visible before "see more", if the platform truncates. */
  fold?: number;
  maxHashtags: number;
  formats: PostFormat[];
  badge: { text: string; className: string };
  guidance: string;
};

export const PLATFORMS: Record<PlatformId, Platform> = {
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    limit: 3000,
    fold: 210,
    maxHashtags: 3,
    formats: ["single", "carousel"],
    badge: { text: "in", className: "bg-[#0a66c2] text-white" },
    guidance:
      "Professional but human. The first two lines must hook the reader before the 'see more' cut (about 210 characters). Short paragraphs of one or two sentences with blank lines between them. No Markdown symbols.",
  },
  x: {
    id: "x",
    label: "X",
    limit: 280,
    maxHashtags: 1,
    formats: ["single", "thread"],
    badge: { text: "𝕏", className: "bg-black text-white dark:bg-white dark:text-black" },
    guidance:
      "Punchy and conversational. Every post must fit in 280 characters (links count as 23). For threads, the first post is the hook and promises what's coming; number the posts like 1/ 2/. No Markdown.",
  },
  threads: {
    id: "threads",
    label: "Threads",
    limit: 500,
    maxHashtags: 1,
    formats: ["single", "thread"],
    badge: { text: "@", className: "bg-black text-white dark:bg-white dark:text-black" },
    guidance:
      "Casual, friendly, conversational, like texting a smart friend. Each post fits in 500 characters. No Markdown.",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    limit: 63206,
    fold: 480,
    maxHashtags: 2,
    formats: ["single"],
    badge: { text: "f", className: "bg-[#1877f2] text-white" },
    guidance:
      "Warm and community-minded. Aim for under 500 characters; longer stories are fine when they earn it. Invite comments with a simple question. No Markdown.",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    limit: 2200,
    fold: 125,
    maxHashtags: 5,
    formats: ["single", "carousel"],
    badge: { text: "IG", className: "bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white" },
    guidance:
      "Caption for an image or carousel. The first line (about 125 characters) must stop the scroll. Short lines, emojis welcome where natural, a clear call to action (save, share, comment). For carousels, each slide is a short headline plus one or two lines (max ~30 words). No Markdown.",
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];

const URL_RE = /https?:\/\/\S+/g;

/** Characters as the platform counts them (X counts every link as 23). */
export function countChars(platform: PlatformId, text: string): number {
  if (platform === "x") {
    const urls = text.match(URL_RE) ?? [];
    return Array.from(text.replace(URL_RE, "")).length + urls.length * 23;
  }
  return Array.from(text).length;
}

/** The text that actually gets posted: caption plus hashtags for Instagram. */
export function fullText(platform: PlatformId, content: string, hashtags: string[]): string {
  const tags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  if (!tags) return content;
  return platform === "x" || platform === "threads" ? `${content.trimEnd()} ${tags}` : `${content.trimEnd()}\n\n${tags}`;
}
