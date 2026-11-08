import { WebPreviewBody } from "@/lib/satori/api-schemas";
import { rateLimit } from "@/lib/satori/limits";
import { jsonError, readBody, satoriContext } from "@/lib/satori/server";
import { fetchPage, WebError } from "@/lib/satori/web";

export const maxDuration = 30;

/**
 * Reads a public web page and returns its readable text, so it can be attached to a
 * request as reference material. The person sees the title and size before using it.
 */
export async function POST(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, WebPreviewBody);
  if ("denied" in body) return body.denied;
  const wait = rateLimit(`${ctx.userId}:web`, 20);
  if (wait) return jsonError(`Slow down a little — try again in ${wait}s.`, 429, { retryable: true });
  try {
    const page = await fetchPage(body.data.url);
    return Response.json({ source: { url: page.finalUrl, title: page.title, text: page.text }, truncated: page.truncated, chars: page.text.length });
  } catch (e) {
    if (e instanceof WebError) return jsonError(e.message, 422);
    console.error("[satori] web preview failed");
    return jsonError("Couldn't read that page.", 502, { retryable: true });
  }
}
