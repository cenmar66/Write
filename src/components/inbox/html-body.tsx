"use client";

import { useEffect, useRef, useState } from "react";
import { EMAIL_CSP, EMAIL_CSP_NO_REMOTE } from "@/lib/inbox/html";

/**
 * Shows an email's formatted (HTML) version like Gmail does: images, layout, links.
 * Safety: the HTML was cleaned on the server, and it runs in a sandboxed frame with
 * scripts disabled and a strict Content-Security-Policy (no scripts, no network calls
 * except images, no forms). Links open in a new tab. Suspicious messages don't load
 * remote images (they can track that you opened the email).
 */
export function HtmlBody({ html, blockRemote }: { html: string; blockRemote: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(240);
  useEffect(() => () => observer.current?.disconnect(), []);

  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${blockRemote ? EMAIL_CSP_NO_REMOTE : EMAIL_CSP}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>html,body{margin:0;background:#fff;color:#202124}body{padding:16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%!important}pre{white-space:pre-wrap}blockquote{margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex}</style></head><body>${html}</body></html>`;

  const measure = () => {
    const d = frame.current?.contentDocument;
    if (!d?.documentElement) return;
    setHeight(Math.min(Math.max(d.documentElement.scrollHeight, 80), 20_000));
  };

  return (
    <iframe
      ref={frame}
      title="Email content"
      className="ip-html-body"
      // No allow-scripts: nothing in the email can run. Same-origin only lets us measure its height.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={doc}
      style={{ height }}
      onLoad={() => {
        measure();
        observer.current?.disconnect();
        const body = frame.current?.contentDocument?.body;
        if (body && typeof ResizeObserver !== "undefined") {
          observer.current = new ResizeObserver(measure); // images loading change the height
          observer.current.observe(body);
        }
      }}
    />
  );
}
