// Prepares an email's HTML for display. Email HTML is untrusted: it is shown only inside a
// sandboxed iframe with no scripts (see components/inbox/html-body.tsx); this pass is the
// second layer, removing anything active before it ever reaches the browser.
// The AI never sees this HTML: it reads the plain text through lib/inbox/safety.ts.

export interface InlineImage {
  cid: string;
  mimeType: string;
  /** base64 (standard alphabet) */
  data: string;
}

const MAX_HTML = 1_500_000;

/** Removes scripts, frames, forms, event handlers and javascript: links; inlines cid: images. */
export function sanitizeEmailHtml(html: string, inline: InlineImage[] = []): string {
  let s = html.slice(0, MAX_HTML);
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // Elements removed with their content.
  s = s.replace(/<(script|iframe|frame|frameset|object|embed|applet|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "");
  // Leftover or self-closing dangerous tags.
  s = s.replace(/<\/?(script|iframe|frame|frameset|object|embed|applet|base|meta|link|form|input|button|select|textarea|svg|math|portal)\b[^>]*>/gi, "");
  // Event handlers (onload=, onclick=, …) in any quoting style.
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // javascript:/vbscript:/data:text links and srcs (data: images stay).
  s = s.replace(/\s(href|src|action|formaction|xlink:href|background|srcset)\s*=\s*("|')\s*(javascript|vbscript|data:(?!image\/(png|gif|jpe?g|webp)))[^"']*\2/gi, "");
  s = s.replace(/\s(href|src|action|formaction|background)\s*=\s*(javascript|vbscript):[^\s>]*/gi, "");
  // CSS expressions / javascript: in style attributes.
  s = s.replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, "");
  // Inline (cid:) images from the message itself.
  const byCid = new Map(inline.map((i) => [i.cid.replace(/^<|>$/g, "").toLowerCase(), i]));
  s = s.replace(/(["'])cid:([^"']+)\1/gi, (m, q: string, cid: string) => {
    const img = byCid.get(cid.trim().toLowerCase());
    return img && /^image\/(png|gif|jpe?g|webp)$/i.test(img.mimeType) ? `${q}data:${img.mimeType};base64,${img.data}${q}` : `${q}${q}`;
  });
  return s;
}

/** Content Security Policy for the email frame: no scripts, no connections, no forms. */
export const EMAIL_CSP = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:; media-src https: data:; form-action 'none'";

/** Same policy without remote content (used for suspicious messages): only inline images. */
export const EMAIL_CSP_NO_REMOTE = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'";
