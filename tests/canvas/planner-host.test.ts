import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isPlannerHost } from "@/lib/planner-host";
import { proxy } from "@/proxy";

describe("cenmar.org opens the planner", () => {
  it("recognises the planner domains", () => {
    expect(isPlannerHost("cenmar.org")).toBe(true);
    expect(isPlannerHost("www.cenmar.org")).toBe(true);
    expect(isPlannerHost("CENMAR.ORG:443")).toBe(true);
    expect(isPlannerHost("write-ai.vercel.app")).toBe(false);
    expect(isPlannerHost(null)).toBe(false);
  });

  it("sends the home page to /canvas", async () => {
    const res = await proxy(new NextRequest("https://cenmar.org/", { headers: { host: "cenmar.org" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://cenmar.org/canvas");
  });
});
