// Extra context a person can attach to a request: images, website pages, and (in the
// Testing Lab) web search and connected apps. Shared by the browser and the server.
import { z } from "zod";

export const MAX_IMAGES = 4;
export const MAX_SOURCES = 3;
export const MAX_CONNECTORS_PER_RUN = 5;
/** Base64 characters per image (~1.1 MB of image data). The browser shrinks photos first. */
export const MAX_IMAGE_BASE64 = 1_500_000;
/** Characters of readable text kept from one web page. */
export const MAX_SOURCE_CHARS = 15_000;
/** Body limit for routes that accept images (Vercel allows 4.5 MB). */
export const MAX_BODY_WITH_IMAGES = 4_200_000;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export const ImageInput = z.object({
  mediaType: z.enum(IMAGE_TYPES),
  data: z
    .string()
    .min(16)
    .max(MAX_IMAGE_BASE64, "That image is too large even after shrinking. Try a smaller one.")
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Image data must be base64."),
  name: z.string().max(120).optional(),
});
export type ImageInput = z.infer<typeof ImageInput>;

export const SourceInput = z.object({
  url: z.string().url().max(2000),
  title: z.string().max(300).default(""),
  text: z.string().max(MAX_SOURCE_CHARS + 200),
});
export type SourceInput = z.infer<typeof SourceInput>;

export const Images = z.array(ImageInput).max(MAX_IMAGES, `Attach at most ${MAX_IMAGES} images.`).default([]);
export const Sources = z.array(SourceInput).max(MAX_SOURCES, `Add at most ${MAX_SOURCES} websites.`).default([]);

/** Connector (MCP server) as given to a provider for one run. Server-only: includes the token. */
export type RunConnector = { name: string; url: string; token?: string };

/** Optional tools for Testing Lab runs. Only providers with `supportsTools` use them. */
export type RunTools = { webSearch?: boolean; connectors?: RunConnector[] };
