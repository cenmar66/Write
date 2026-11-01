import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "@/lib/inbox/html";
import { extractBody } from "@/lib/inbox/mail/parse";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("email HTML for display", () => {
  it("removes anything that could run code, keeps layout and images", () => {
    const out = sanitizeEmailHtml(
      `<div style="color:red" onclick="steal()"><img src="https://cdn.test/logo.png" onerror="x()" alt="Logo">
       <script>alert(1)</script><iframe src="https://evil.test"></iframe><svg onload="x()"><script>y()</script></svg>
       <a href="javascript:alert(1)">bad</a><a href="https://ok.test">good</a><form action="https://evil.test"><input name=p></form>
       <meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test/">
       <a href="data:text/html,<script>1</script>">d</a><p style="background:url(javascript:x)">s</p></div>`,
    );
    for (const bad of ["<script", "onclick", "onerror", "onload", "<iframe", "<svg", "javascript:", "<form", "<input", "<meta", "<base", "data:text/html"]) expect(out.toLowerCase()).not.toContain(bad);
    expect(out).toContain('src="https://cdn.test/logo.png"');
    expect(out).toContain('href="https://ok.test"');
    expect(out).toContain('style="color:red"');
  });

  it("inlines images embedded in the message (cid:), drops unknown ones", () => {
    const out = sanitizeEmailHtml('<img src="cid:logo@x"><img src="cid:missing@x">', [{ cid: "<logo@x>", mimeType: "image/png", data: "AAAA" }]);
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out).not.toContain("cid:");
  });

  it("extracts the HTML part and embedded images from a Gmail message", () => {
    const r = extractBody({
      mimeType: "multipart/related",
      parts: [
        { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64("[image: Logo] Hi") } }, { mimeType: "text/html", body: { data: b64('<img src="cid:logo"> Hi') } }] },
        { mimeType: "image/png", filename: "logo.png", headers: [{ name: "Content-ID", value: "<logo>" }], body: { attachmentId: "att1", size: 1200 } },
      ],
    });
    expect(r.text).toBe("[image: Logo] Hi");
    expect(r.html).toContain("cid:logo");
    expect(r.inline).toEqual([{ cid: "logo", mimeType: "image/png", attachmentId: "att1", data: undefined, size: 1200 }]);
  });
});
