import { describe, expect, it } from "vitest";
import { inboxPath, isInboxHost } from "@/lib/inbox-host";

describe("InboxSatori's own domain", () => {
  it("recognises its hosts, with or without www and port", () => {
    expect(isInboxHost("inboxsatori.com")).toBe(true);
    expect(isInboxHost("WWW.InboxSatori.com:443")).toBe(true);
    expect(isInboxHost("promptsatori.com")).toBe(false);
    expect(isInboxHost(null)).toBe(false);
  });
  it("maps clean addresses into /inbox and never shows Write.ai pages", () => {
    expect(inboxPath("/")).toBe("/inbox");
    expect(inboxPath("/mail")).toBe("/inbox/mail");
    expect(inboxPath("/brief")).toBe("/inbox/brief");
    expect(inboxPath("/docs")).toBe("/inbox/docs"); // Write.ai page -> InboxSatori 404
    for (const shared of ["/inbox", "/inbox/mail", "/api/inbox/bootstrap", "/api/inbox/gmail/callback", "/login", "/auth/callback", "/_next/static/x.js", "/inbox-icons/icon.svg"]) expect(inboxPath(shared)).toBeNull();
    expect(inboxPath("/inboxes")).toBe("/inbox/inboxes");
  });
});
