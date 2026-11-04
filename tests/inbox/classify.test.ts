import { describe, expect, it } from "vitest";
import { classifyMessage, feedbackFor, type ClassifyContext } from "@/lib/inbox/classify";
import { findDates, firstDeadline } from "@/lib/inbox/deadlines";
import { ME, msg } from "./fixtures";

const NOW = new Date("2026-10-28T16:30:00.000Z"); // Wednesday
const ctx = (over: Partial<ClassifyContext> = {}): ClassifyContext => ({ me: ME, sender: null, feedback: {}, iParticipated: false, workspaceKind: "business", now: NOW, ...over });
const sender = (over = {}) => ({ is_vip: false, always_priority: false, screening: "unknown" as const, default_category: null, blocked: false, received_count: 3, replied_count: 0, sent_to_count: 0, ...over });

describe("classification", () => {
  it("files newsletters as low-value newsletters with high confidence", () => {
    const c = classifyMessage(msg({ from_email: "news@weekly.test", list_id: "<w.test>", signals: { bulk: true }, subject: "Weekly digest #12" }), ctx());
    expect(c.msg_type).toBe("newsletter");
    expect(c.category).toBe("newsletters");
    expect(c.importance).toBe("low");
    expect(c.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not treat shouty marketing as urgent", () => {
    const c = classifyMessage(msg({ from_email: "deals@shop.test", subject: "URGENT!!! 50% OFF ENDS NOW!!!", signals: { bulk: true }, body_text: "ACT IMMEDIATELY" }), ctx());
    expect(c.msg_type).toBe("marketing");
    expect(c.importance).toBe("low");
    expect(c.time_sensitivity).toBe("unknown");
  });

  it("ignores 'urgent' with no date from an unknown person", () => {
    const c = classifyMessage(msg({ subject: "URGENT", body_text: "This is extremely urgent!!!" }), ctx({ sender: sender({ received_count: 1 }) }));
    expect(c.time_sensitivity).toBe("flexible");
    expect(c.importance).not.toBe("critical");
  });

  it("raises a VIP asking for a review with an explicit deadline", () => {
    const c = classifyMessage(msg({ subject: "Contract", body_text: "Could you review and approve the contract by Thursday?" }), ctx({ sender: sender({ is_vip: true, replied_count: 4 }) }));
    expect(["critical", "high"]).toContain(c.importance);
    expect(c.action).toBe("review_needed");
    expect(c.time_sensitivity).toBe("this_week");
    expect(c.factors.some((f) => f.source === "deadline")).toBe(true);
    expect(c.explanation).toContain("VIP");
  });

  it("only allows 'critical' with hard evidence", () => {
    const c = classifyMessage(msg({ body_text: "Can you send the numbers? Let me know." }), ctx({ sender: sender({ replied_count: 9 }), iParticipated: true, weights: { base: 70 } }));
    expect(c.importance).toBe("high");
    const today = classifyMessage(msg({ body_text: "Please send the numbers by today 6pm." }), ctx({ sender: sender({ is_vip: true, replied_count: 9 }), iParticipated: true }));
    expect(today.importance).toBe("critical");
  });

  it("applies the user's past corrections for this sender", () => {
    const fb = feedbackFor([
      { field: "importance", new_value: "high", created_at: "2026-10-01" },
      { field: "importance", new_value: "low", created_at: "2026-10-20" },
      { field: "category", new_value: "read_later", created_at: "2026-10-21" },
    ]);
    const c = classifyMessage(msg({ body_text: "Can you call me?" }), ctx({ feedback: fb }));
    expect(c.importance).toBe("low");
    expect(c.category).toBe("read_later");
    expect(c.factors.some((f) => f.source === "feedback")).toBe(true);
  });

  it("sends low-signal personal mail to the uncertain review folder", () => {
    const c = classifyMessage(msg({ from_email: "someone@gmail.com", subject: "hey", body_text: "just saw this" }), ctx({ sender: sender({ received_count: 1 }) }));
    expect(c.category).toBe("review");
    expect(c.confidence).toBeLessThan(0.55);
  });

  it("treats auto-replies and bounces as notifications", () => {
    expect(classifyMessage(msg({ subject: "Out of office", signals: { autoReply: true } }), ctx()).msg_type).toBe("notification");
    expect(classifyMessage(msg({ from_email: "mailer-daemon@x.test", signals: { dsn: true } }), ctx()).importance).toBe("low");
  });

  it("recognises invoices and receipts", () => {
    expect(classifyMessage(msg({ from_email: "billing@vendor.test", subject: "Invoice 44", signals: { bulk: true } }), ctx()).category).toBe("receipts");
    expect(classifyMessage(msg({ from_email: "ana@vendor.test", subject: "Invoice for October", body_text: "Attached is our invoice." }), ctx()).msg_type).toBe("financial");
  });
});

describe("deadlines", () => {
  const ref = new Date("2026-10-28T16:00:00.000Z");
  it("separates explicit deadlines from mentioned dates", () => {
    const found = findDates("We met on Monday. Please send the report by Friday.", ref);
    expect(found.find((d) => d.phrase.includes("Friday"))?.explicit).toBe(true);
    expect(found.find((d) => d.phrase.includes("Monday"))?.explicit ?? false).toBe(false);
  });
  it("reads Spanish deadlines", () => {
    expect(firstDeadline("¿Puedes enviarme la factura antes del viernes?", ref)?.explicit).toBe(true);
  });
  it("does not invent a deadline from urgency words", () => {
    expect(firstDeadline("URGENT!!! Respond ASAP!!!", ref)).toBeNull();
  });
});
