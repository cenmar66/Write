// Reads a public web page for use as reference material. Server-only.
//
// Safety: only http(s); the host must resolve to public addresses (no localhost, private
// networks, link-local / cloud metadata, or multicast); redirects are followed by hand
// and re-checked each hop; small time and size limits; text-like content only. The page
// text is untrusted and is always wrapped as data in meta-prompts.
// Known limit: the address is checked just before connecting, so a host that changes
// its DNS answer within that instant could still reach an internal address. On Vercel's
// serverless functions there is no private network to reach.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_SOURCE_CHARS } from "./context";

export class WebError extends Error {}

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;
const TEXT_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain|text\/markdown|application\/json|application\/[a-z.+-]*\+json|text\/xml|application\/xml)/i;

/** Test-only escape hatch so automated tests can read pages from the local server. */
const allowLocal = () => process.env.NODE_ENV !== "production" && process.env.SATORI_ALLOW_LOCAL_FETCH === "1";

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

/** True for addresses a server must never be tricked into calling. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4Private(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8");
  }
  return true;
}

/** Validates a URL and checks every address its host resolves to. */
export async function checkUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebError("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new WebError("Only http and https web addresses can be read.");
  if (url.username || url.password) throw new WebError("Addresses with a username or password can't be read.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (allowLocal() && (host === "localhost" || host === "127.0.0.1")) return url;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new WebError("That address points to a private network.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length) throw new WebError("Couldn't find that website. Check the address.");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new WebError("That address points to a private network.");
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Readable text from HTML: title, description, and body text without scripts or navigation. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim()).slice(0, 300);
  const desc = decode(html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? "").trim();
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|footer|header|aside|button|select)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|section|article|li|ul|ol|table|tr|h[1-6]|blockquote|pre|main)>/gi, "\n")
    .replace(/<h[1-6]\b[^>]*>/gi, "\n\n")
    .replace(/<td\b[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text: desc && !text.startsWith(desc) ? `${desc}\n\n${text}` : text };
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(value);
    if (size >= MAX_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export type Page = { url: string; finalUrl: string; title: string; text: string; truncated: boolean };

/** Fetches a public page and returns its readable text. Throws WebError with a plain message. */
export async function fetchPage(raw: string): Promise<Page> {
  let url = await checkUrl(raw);
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "PromptSatori/1.0 (reads pages a signed-in user asked for)", Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1" },
      });
    } catch (e) {
      throw new WebError(e instanceof Error && e.name === "TimeoutError" ? "That website took too long to respond." : "Couldn't reach that website.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop === MAX_REDIRECTS) throw new WebError("That website redirected too many times.");
      url = await checkUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    break;
  }
  if (!res) throw new WebError("Couldn't reach that website.");
  if (res.status === 401 || res.status === 403) throw new WebError("That page needs a login or blocks automated reading.");
  if (!res.ok) throw new WebError(`That website answered with an error (${res.status}).`);
  const type = res.headers.get("content-type") ?? "text/html";
  if (!TEXT_TYPES.test(type)) throw new WebError(/pdf/i.test(type) ? "PDFs can't be read yet. Copy the text in instead." : "That address isn't a readable page (it may be a file or image).");
  const body = await readCapped(res);
  const isHtml = /html|xml/i.test(type);
  const { title, text } = isHtml ? htmlToText(body) : { title: "", text: body.trim() };
  if (!text) throw new WebError("Couldn't find readable text on that page. It may need JavaScript or a login.");
  return { url: raw, finalUrl: url.toString(), title: title || url.hostname, text: text.slice(0, MAX_SOURCE_CHARS), truncated: text.length > MAX_SOURCE_CHARS };
}
