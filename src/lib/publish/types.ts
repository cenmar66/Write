import type { PlatformId, PostFormat } from "@/lib/social/platforms";

export type MediaItem = { url: string; type: "image" | "video"; path?: string };

export type PostRow = {
  id: string;
  user_id: string;
  platform: PlatformId;
  format: PostFormat;
  content: string;
  parts: string[];
  hashtags: string[];
  media: MediaItem[];
  status: string;
  scheduled_at: string | null;
};

export type PublishResult = { url: string | null };

/** Platforms the app can post to by itself. X stays manual (copy + open X). */
export const AUTO_PLATFORMS: PlatformId[] = ["linkedin", "facebook", "instagram", "threads"];
