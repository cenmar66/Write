"use client";

import { useEffect, useState } from "react";

/**
 * Shown instead of a blank page when something crashes in the browser. It says what
 * went wrong (message, browser, page) so the problem can be reported and fixed, and
 * offers to try again. It shows only the error itself: no email content, no tokens.
 */
export function ErrorDetails({ error, retry, title = "Something went wrong" }: { error: unknown; retry?: () => void; title?: string }) {
  const e = error instanceof Error ? error : null;
  const [copied, setCopied] = useState(false);
  const details = [
    `Error: ${e ? `${e.name}: ${e.message}` : String(error)}`,
    ...(e && "digest" in e && e.digest ? [`Digest: ${String(e.digest)}`] : []),
    ...(e?.stack ? [`Stack: ${e.stack.split("\n").slice(0, 6).join("\n")}`] : []),
    `Page: ${typeof location !== "undefined" ? location.pathname : ""}`,
    `Browser: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
  ].join("\n");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#161a22", color: "#e8eaf0" }}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</p>
        <p style={{ fontSize: 14, opacity: 0.8, margin: "6px 0 14px" }}>The page hit an error in this browser. The details below say what happened.</p>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.5, background: "#0e1117", border: "1px solid #2a3140", borderRadius: 10, padding: 12, margin: 0, maxHeight: "45dvh", overflow: "auto" }}>{details}</pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button onClick={() => (retry ? retry() : location.reload())} style={btn(true)}>Try again</button>
          <button onClick={() => location.reload()} style={btn(false)}>Reload page</button>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(details).then(() => setCopied(true), () => undefined);
            }}
            style={btn(false)}
          >
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>
      </div>
    </div>
  );
}

const btn = (primary: boolean): React.CSSProperties => ({
  font: "inherit",
  fontSize: 14,
  fontWeight: 600,
  padding: "10px 14px",
  borderRadius: 10,
  border: primary ? "none" : "1px solid #2a3140",
  background: primary ? "#4f7cff" : "transparent",
  color: primary ? "#fff" : "#e8eaf0",
});
