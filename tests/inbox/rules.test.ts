import { describe, expect, it } from "vitest";
import { applyToClassification, dryRun, findConflicts, planActions, validateRule, type Rule } from "@/lib/inbox/rules";
import { msg } from "./fixtures";

const rule = (over: Partial<Rule>): Rule => ({ id: over.id ?? "r", name: over.name ?? "R", enabled: true, priority: 100, match: "all", conditions: [], actions: [], stop_processing: false, confirmed_broad: false, ...over });
const base = { importance: "normal" as const, msg_type: "newsletter" as const, action: "informational" as const, time_sensitivity: "unknown" as const, category: "newsletters" };

describe("rules engine", () => {
  const m = { ...msg({ from_email: "news@weekly.test", subject: "Weekly" }), classification: base, sender_vip: false };

  it("matches deterministic conditions", () => {
    const r = rule({ conditions: [{ field: "from_domain", op: "equals", value: "weekly.test" }, { field: "msg_type", op: "equals", value: "newsletter" }], actions: [{ kind: "set_category", value: "read_later" }] });
    expect(planActions([r], m, "observe", { canModifyProvider: false })).toHaveLength(1);
    expect(planActions([{ ...r, conditions: [{ field: "from", op: "equals", value: "other@x.test" }] }], m, "observe", { canModifyProvider: false })).toHaveLength(0);
  });

  it("first rule by priority wins a field; stop_processing halts later rules", () => {
    const a = rule({ id: "a", priority: 10, actions: [{ kind: "set_importance", value: "low" }] });
    const b = rule({ id: "b", priority: 20, actions: [{ kind: "set_importance", value: "high" }, { kind: "set_category", value: "todo" }] });
    const plan = planActions([b, a], m, "automatic", { canModifyProvider: true });
    expect(plan.find((p) => p.action.kind === "set_importance")?.ruleId).toBe("a");
    expect(plan.find((p) => p.action.kind === "set_category")?.ruleId).toBe("b");
    const stopped = planActions([b, { ...a, stop_processing: true }], m, "automatic", { canModifyProvider: true });
    expect(stopped.map((p) => p.ruleId)).toEqual(["a"]);
  });

  it("rules beat AI/heuristics in the final classification", () => {
    const plan = planActions([rule({ actions: [{ kind: "set_importance", value: "high" }] })], m, "observe", { canModifyProvider: false });
    const out = applyToClassification({ ...base, priority_score: 30, factors: [], source: "ai" as const }, plan);
    expect(out.importance).toBe("high");
    expect(out.source).toBe("rules");
    expect(out.priority_score).toBeGreaterThanOrEqual(62);
  });

  it("gates mailbox changes by automation mode and confirmation", () => {
    const archive = rule({ actions: [{ kind: "gmail_archive" }] });
    expect(planActions([archive], m, "observe", { canModifyProvider: true })[0].decision).toBe("suggest");
    expect(planActions([archive], m, "assisted", { canModifyProvider: true })[0].decision).toBe("suggest");
    expect(planActions([archive], m, "automatic", { canModifyProvider: true })[0].decision).toBe("suggest"); // not confirmed
    expect(planActions([{ ...archive, confirmed_broad: true }], m, "automatic", { canModifyProvider: true })[0].decision).toBe("apply");
    expect(planActions([{ ...archive, confirmed_broad: true }], m, "automatic", { canModifyProvider: false })[0].decision).toBe("blocked");
  });

  it("previews without applying and flags broad rules", () => {
    const sample = Array.from({ length: 30 }, (_, i) => ({ ...msg({ id: `s${i}`, from_email: i < 10 ? "a@news.test" : "b@x.test" }), classification: base }));
    const r = dryRun(rule({ conditions: [{ field: "from_domain", op: "equals", value: "news.test" }], actions: [{ kind: "gmail_archive" }] }), sample, "automatic", { canModifyProvider: true });
    expect(r.matchCount).toBe(10);
    expect(r.broad).toBe(true);
    expect(r.needsConfirmation.length).toBe(2);
    expect(dryRun(rule({ actions: [{ kind: "set_category", value: "todo" }] }), sample, "observe", { canModifyProvider: false }).broad).toBe(true);
  });

  it("detects conflicting rules on real messages", () => {
    const a = rule({ id: "a", conditions: [{ field: "subject", op: "contains", value: "weekly" }], actions: [{ kind: "set_category", value: "read_later" }] });
    const b = rule({ id: "b", conditions: [{ field: "from_domain", op: "ends_with", value: ".test" }], actions: [{ kind: "set_category", value: "todo" }] });
    const conflicts = findConflicts([a, b], [m]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].values).toEqual(["read_later", "todo"]);
  });

  it("validates input and has no delete action", () => {
    expect(validateRule({ name: "x", actions: [{ kind: "delete_forever" }] }).ok).toBe(false);
    expect(validateRule({ name: "x", actions: [{ kind: "set_importance", value: "mega" }] }).ok).toBe(false);
    expect(validateRule({ name: "", actions: [{ kind: "mark_done" }] }).ok).toBe(false);
    expect(validateRule({ name: "x", conditions: [{ field: "eval", op: "equals", value: "1" }], actions: [{ kind: "mark_done" }] }).ok).toBe(false);
    const ok = validateRule({ name: "VIP", conditions: [{ field: "sender_vip", op: "is_true" }], actions: [{ kind: "set_importance", value: "high" }] });
    expect(ok.ok).toBe(true);
  });
});
