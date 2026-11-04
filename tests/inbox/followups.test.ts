import { describe, expect, it } from "vitest";
import { analyzeThread } from "@/lib/inbox/followups";
import { ME, msg } from "./fixtures";

const now = new Date("2026-11-03T17:00:00.000Z"); // Tuesday
const me = { email: "me@x.test", name: "Me" };
const nina = { email: "nina@p.test", name: "Nina" };

describe("follow-up engine", () => {
  it("tracks my unanswered request (someone owes me)", () => {
    const sent = msg({ id: "s1", is_sent: true, from_email: me.email, to_addrs: [nina], subject: "Terms", body_text: "Could you approve the terms?", received_at: "2026-10-28T10:00:00Z" });
    const f = analyzeThread([sent], ME, { now, thresholdDays: 3 });
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("they_owe");
    expect(f[0].counterpart).toBe("nina@p.test");
    expect(f[0].due_explicit).toBe(false);
    expect(f[0].evidence).toContain("approve");
  });

  it("ignores auto-replies and bounces as responses", () => {
    const sent = msg({ id: "s1", is_sent: true, from_email: me.email, to_addrs: [nina], body_text: "Can you confirm?", received_at: "2026-10-28T10:00:00Z" });
    const ooo = msg({ id: "o1", from_email: nina.email, subject: "Automatic reply: Out of office", signals: { autoReply: true }, received_at: "2026-10-28T10:01:00Z" });
    const bounce = msg({ id: "b1", from_email: "mailer-daemon@x.test", signals: { dsn: true }, received_at: "2026-10-28T10:02:00Z" });
    const f = analyzeThread([sent, ooo, bounce], ME, { now, thresholdDays: 3 });
    expect(f.map((x) => x.kind)).toEqual(["they_owe"]);
  });

  it("closes once a human replies, then I owe them if they asked something", () => {
    const sent = msg({ id: "s1", is_sent: true, from_email: me.email, to_addrs: [nina], body_text: "Can you confirm?", received_at: "2026-10-28T10:00:00Z" });
    const reply = msg({ id: "r1", from_email: nina.email, from_name: "Nina", to_addrs: [me], body_text: "Confirmed. Can you send the invoice by Friday?", received_at: "2026-10-29T10:00:00Z" });
    const f = analyzeThread([sent, reply], ME, { now, thresholdDays: 3 });
    expect(f.map((x) => x.kind)).toEqual(["i_owe"]);
    expect(f[0].due_explicit).toBe(true);
  });

  it("detects promises and drops them once the promiser writes again", () => {
    const promise = msg({ id: "p1", is_sent: true, from_email: me.email, to_addrs: [nina], body_text: "Great call. I'll send the deck by Friday.", received_at: "2026-10-28T10:00:00Z" });
    expect(analyzeThread([promise], ME, { now, thresholdDays: 3 }).some((x) => x.kind === "commitment")).toBe(true);
    const kept = msg({ id: "p2", is_sent: true, from_email: me.email, to_addrs: [nina], body_text: "Here's the deck.", received_at: "2026-10-30T10:00:00Z" });
    expect(analyzeThread([promise, kept], ME, { now, thresholdDays: 3 }).some((x) => x.kind === "commitment")).toBe(false);
  });

  it("records what other people promised me", () => {
    const theirs = msg({ id: "c1", from_email: "sam@build.test", from_name: "Sam", to_addrs: [me], body_text: "I'll send the updated estimate by Monday.", received_at: "2026-10-29T10:00:00Z" });
    const f = analyzeThread([theirs], ME, { now, thresholdDays: 3 });
    expect(f.find((x) => x.kind === "they_owe")?.title).toContain("Sam promised");
  });

  it("produces stable dedupe keys (re-analysis can't duplicate)", () => {
    const sent = msg({ id: "s1", is_sent: true, from_email: me.email, to_addrs: [nina], body_text: "Can you confirm?" });
    const a = analyzeThread([sent], ME, { now, thresholdDays: 3 });
    const b = analyzeThread([sent], ME, { now: new Date(now.getTime() + 86_400_000), thresholdDays: 3 });
    expect(a.map((x) => x.dedupe_key)).toEqual(b.map((x) => x.dedupe_key));
  });
});
