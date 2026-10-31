// No-code rules: deterministic conditions → actions. Pure and testable.
// Precedence: explicit user rules (by priority, then age) > sender settings > feedback > AI > heuristics.
// Provider actions (touching Gmail) only run in Automatic mode, on rules the user
// confirmed; in Observe/Assisted they become suggestions. There is no delete action.

import type { AutomationMode, Classification, Importance, MessageRow } from "./types";
import { domainOf } from "./mail/parse";

export type Field =
  | "from" | "from_domain" | "to" | "cc" | "subject" | "text" | "has_attachment" | "is_unread"
  | "importance" | "msg_type" | "action" | "time_sensitivity" | "category" | "list" | "sender_vip" | "account_id";
export type Op = "equals" | "not_equals" | "contains" | "not_contains" | "ends_with" | "in" | "is_true" | "is_false";

export interface Condition {
  field: Field;
  op: Op;
  value?: string | string[];
}

export type ActionKind =
  | "set_importance" | "set_category" | "mark_done" | "snooze_days" | "suppress_notifications"
  | "suggest_task" | "track_reply" | "gmail_label" | "gmail_archive" | "gmail_mark_read";

export interface RuleAction {
  kind: ActionKind;
  value?: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  match: "all" | "any";
  conditions: Condition[];
  actions: RuleAction[];
  stop_processing: boolean;
  account_id?: string | null;
  confirmed_broad?: boolean;
  created_at?: string;
}

export const ACTION_CATALOG: Record<ActionKind, { label: string; scope: "app" | "provider"; reversible: boolean; destructive: boolean; needsValue?: "importance" | "category" | "days" | "label" }> = {
  set_importance: { label: "Set importance", scope: "app", reversible: true, destructive: false, needsValue: "importance" },
  set_category: { label: "Move to category", scope: "app", reversible: true, destructive: false, needsValue: "category" },
  mark_done: { label: "Mark done in InboxPilot", scope: "app", reversible: true, destructive: false },
  snooze_days: { label: "Snooze for N days", scope: "app", reversible: true, destructive: false, needsValue: "days" },
  suppress_notifications: { label: "Don't notify me", scope: "app", reversible: true, destructive: false },
  suggest_task: { label: "Suggest a task", scope: "app", reversible: true, destructive: false },
  track_reply: { label: "Remind me if no reply in N business days", scope: "app", reversible: true, destructive: false, needsValue: "days" },
  gmail_label: { label: "Add Gmail label", scope: "provider", reversible: true, destructive: false, needsValue: "label" },
  gmail_archive: { label: "Archive in Gmail (skip inbox)", scope: "provider", reversible: true, destructive: true },
  gmail_mark_read: { label: "Mark read in Gmail", scope: "provider", reversible: true, destructive: true },
};

export type RuleMessage = Pick<MessageRow, "id" | "account_id" | "from_email" | "to_addrs" | "cc_addrs" | "subject" | "snippet" | "body_text" | "has_attachments" | "is_unread" | "list_id"> & {
  classification?: Pick<Classification, "importance" | "msg_type" | "action" | "time_sensitivity" | "category"> | null;
  sender_vip?: boolean;
};

const lc = (v: unknown) => String(v ?? "").toLowerCase();

function fieldValue(m: RuleMessage, f: Field): string | string[] | boolean {
  switch (f) {
    case "from": return lc(m.from_email);
    case "from_domain": return domainOf(m.from_email);
    case "to": return (m.to_addrs ?? []).map((a) => lc(a.email));
    case "cc": return (m.cc_addrs ?? []).map((a) => lc(a.email));
    case "subject": return lc(m.subject);
    case "text": return lc(`${m.subject}\n${m.snippet}\n${m.body_text ?? ""}`);
    case "has_attachment": return !!m.has_attachments;
    case "is_unread": return !!m.is_unread;
    case "list": return lc(m.list_id);
    case "sender_vip": return !!m.sender_vip;
    case "account_id": return m.account_id;
    default: return lc(m.classification?.[f as "importance"] ?? "");
  }
}

export function testCondition(m: RuleMessage, c: Condition): boolean {
  const v = fieldValue(m, c.field);
  const vals = (Array.isArray(c.value) ? c.value : c.value != null ? [c.value] : []).map(lc).filter(Boolean);
  const any = (pred: (x: string) => boolean) => (Array.isArray(v) ? v.some(pred) : pred(String(v)));
  switch (c.op) {
    case "is_true": return v === true;
    case "is_false": return v === false;
    case "equals": return any((x) => vals.includes(x));
    case "in": return any((x) => vals.includes(x));
    case "not_equals": return !any((x) => vals.includes(x));
    case "contains": return any((x) => vals.some((needle) => x.includes(needle)));
    case "not_contains": return !any((x) => vals.some((needle) => x.includes(needle)));
    case "ends_with": return any((x) => vals.some((needle) => x.endsWith(needle)));
  }
}

export function ruleMatches(rule: Rule, m: RuleMessage): boolean {
  if (!rule.enabled) return false;
  if (rule.account_id && rule.account_id !== m.account_id) return false;
  if (!rule.conditions.length) return true;
  return rule.match === "any" ? rule.conditions.some((c) => testCondition(m, c)) : rule.conditions.every((c) => testCondition(m, c));
}

export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id));
}

export interface PlannedAction {
  ruleId: string;
  ruleName: string;
  action: RuleAction;
  /** apply = do it now; suggest = show for approval; blocked = not allowed (with reason). */
  decision: "apply" | "suggest" | "blocked";
  reason?: string;
}

/**
 * Evaluates rules for one message in precedence order. The first rule to set a field
 * wins; later rules can't override it. Provider actions are gated by automation mode.
 */
export function planActions(rules: Rule[], m: RuleMessage, mode: AutomationMode, opts: { canModifyProvider: boolean }): PlannedAction[] {
  const out: PlannedAction[] = [];
  const claimed = new Set<string>();
  for (const rule of sortRules(rules)) {
    if (!ruleMatches(rule, m)) continue;
    for (const action of rule.actions) {
      const meta = ACTION_CATALOG[action.kind];
      if (!meta) continue;
      const slot = action.kind === "set_importance" || action.kind === "set_category" ? action.kind : `${action.kind}:${action.value ?? ""}`;
      if (claimed.has(slot)) continue;
      claimed.add(slot);
      let decision: PlannedAction["decision"] = "apply";
      let reason: string | undefined;
      if (meta.scope === "provider") {
        if (!opts.canModifyProvider) {
          decision = mode === "observe" ? "suggest" : "blocked";
          reason = "InboxPilot doesn't have permission to change this mailbox.";
          if (decision === "suggest") reason = "Observe mode: shown as a suggestion only.";
        } else if (mode === "observe") {
          decision = "suggest";
          reason = "Observe mode: shown as a suggestion only.";
        } else if (mode === "assisted") {
          decision = "suggest";
          reason = "Assisted mode: waiting for your approval.";
        } else if (!rule.confirmed_broad) {
          decision = "suggest";
          reason = "Automatic mode applies mailbox changes only from rules you've confirmed.";
        }
      } else if (action.kind === "suggest_task") {
        decision = "suggest";
      }
      out.push({ ruleId: rule.id, ruleName: rule.name, action, decision, reason });
    }
    if (rule.stop_processing) break;
  }
  return out;
}

/** Applies the app-level parts of a plan to a classification (rules beat AI and heuristics). */
export function applyToClassification<C extends Pick<Classification, "importance" | "category" | "factors" | "source" | "priority_score">>(c: C, plan: PlannedAction[]): C {
  const next = { ...c, factors: [...c.factors] };
  for (const p of plan) {
    if (p.decision !== "apply") continue;
    if (p.action.kind === "set_importance" && p.action.value) {
      const imp = p.action.value as Importance;
      next.importance = imp;
      next.priority_score = { critical: Math.max(next.priority_score, 85), high: Math.max(Math.min(next.priority_score, 79), 62), normal: Math.max(Math.min(next.priority_score, 59), 40), low: Math.min(next.priority_score, 30) }[imp] ?? next.priority_score;
      next.factors.push({ label: `Rule “${p.ruleName}” set importance to ${imp}`, weight: 0, source: "rule" });
      next.source = "rules";
    }
    if (p.action.kind === "set_category" && p.action.value) {
      next.category = p.action.value;
      next.factors.push({ label: `Rule “${p.ruleName}” moved it to ${p.action.value}`, weight: 0, source: "rule" });
      next.source = "rules";
    }
  }
  return next;
}

export interface DryRunResult {
  matched: { messageId: string; actions: PlannedAction[] }[];
  matchCount: number;
  sampleSize: number;
  broad: boolean;
  needsConfirmation: string[];
}

/** "What will change?" preview over a sample of real messages. Nothing is applied. */
export function dryRun(rule: Rule, sample: RuleMessage[], mode: AutomationMode, opts: { canModifyProvider: boolean }): DryRunResult {
  const matched = sample.filter((m) => ruleMatches({ ...rule, enabled: true }, m)).map((m) => ({ messageId: m.id, actions: planActions([{ ...rule, enabled: true, confirmed_broad: true }], m, mode, opts) }));
  const broad = rule.conditions.length === 0 || matched.length > 50 || (sample.length >= 20 && matched.length / sample.length > 0.2);
  const needsConfirmation: string[] = [];
  if (broad) needsConfirmation.push(`This rule matches ${matched.length} of ${sample.length} recent messages.`);
  for (const a of rule.actions) if (ACTION_CATALOG[a.kind]?.destructive) needsConfirmation.push(`“${ACTION_CATALOG[a.kind].label}” changes your Gmail mailbox (reversible from Action history).`);
  return { matched, matchCount: matched.length, sampleSize: sample.length, broad, needsConfirmation };
}

export interface RuleConflict {
  a: string;
  b: string;
  field: "set_importance" | "set_category";
  values: [string, string];
  examples: string[];
}

/** Rules that match the same messages but set the same field differently. */
export function findConflicts(rules: Rule[], sample: RuleMessage[]): RuleConflict[] {
  const enabled = sortRules(rules.filter((r) => r.enabled));
  const map = new Map<string, RuleConflict>();
  for (const m of sample) {
    const hits = enabled.filter((r) => ruleMatches(r, m));
    for (const field of ["set_importance", "set_category"] as const) {
      const setters = hits.flatMap((r) => r.actions.filter((a) => a.kind === field).map((a) => ({ r, v: a.value ?? "" })));
      for (let i = 0; i < setters.length; i++)
        for (let j = i + 1; j < setters.length; j++) {
          if (setters[i].v === setters[j].v || setters[i].r.id === setters[j].r.id) continue;
          const key = `${setters[i].r.id}|${setters[j].r.id}|${field}`;
          const c = map.get(key) ?? { a: setters[i].r.id, b: setters[j].r.id, field, values: [setters[i].v, setters[j].v] as [string, string], examples: [] };
          if (c.examples.length < 5) c.examples.push(m.id);
          map.set(key, c);
        }
    }
  }
  return [...map.values()];
}

/** Validates user-submitted rules (types, sizes, allow-listed fields/ops/actions). */
export function validateRule(input: unknown): { ok: true; rule: Omit<Rule, "id"> } | { ok: false; error: string } {
  const r = input as Partial<Rule>;
  if (!r || typeof r !== "object") return { ok: false, error: "Invalid rule." };
  const name = String(r.name ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Give the rule a name." };
  const fields: Field[] = ["from", "from_domain", "to", "cc", "subject", "text", "has_attachment", "is_unread", "importance", "msg_type", "action", "time_sensitivity", "category", "list", "sender_vip", "account_id"];
  const ops: Op[] = ["equals", "not_equals", "contains", "not_contains", "ends_with", "in", "is_true", "is_false"];
  const conditions = (Array.isArray(r.conditions) ? r.conditions : []).slice(0, 20);
  for (const c of conditions) {
    if (!fields.includes(c.field) || !ops.includes(c.op)) return { ok: false, error: `Unsupported condition ${c.field} ${c.op}.` };
    if (!["is_true", "is_false"].includes(c.op) && (c.value == null || (Array.isArray(c.value) ? c.value.length === 0 : String(c.value).trim() === "")))
      return { ok: false, error: `Condition “${c.field}” needs a value.` };
    if (Array.isArray(c.value)) c.value = c.value.slice(0, 50).map((x) => String(x).slice(0, 200));
    else if (c.value != null) c.value = String(c.value).slice(0, 200);
  }
  const actions = (Array.isArray(r.actions) ? r.actions : []).slice(0, 10);
  if (!actions.length) return { ok: false, error: "Add at least one action." };
  for (const a of actions) {
    const meta = ACTION_CATALOG[a.kind as ActionKind];
    if (!meta) return { ok: false, error: `Unsupported action ${a.kind}.` };
    if (meta.needsValue && !String(a.value ?? "").trim()) return { ok: false, error: `“${meta.label}” needs a value.` };
    if (meta.needsValue === "importance" && !["critical", "high", "normal", "low"].includes(String(a.value))) return { ok: false, error: "Importance must be critical, high, normal or low." };
    if (meta.needsValue === "days" && !(Number(a.value) >= 1 && Number(a.value) <= 60)) return { ok: false, error: "Days must be between 1 and 60." };
    if (a.value != null) a.value = String(a.value).slice(0, 80);
  }
  return {
    ok: true,
    rule: {
      name,
      enabled: r.enabled !== false,
      priority: Math.max(0, Math.min(10_000, Math.round(Number(r.priority ?? 100)) || 100)),
      match: r.match === "any" ? "any" : "all",
      conditions,
      actions,
      stop_processing: !!r.stop_processing,
      account_id: r.account_id ?? null,
      confirmed_broad: !!r.confirmed_broad,
    },
  };
}

/** Starter rules the onboarding offers (user reviews each one before it's created). */
export const RULE_TEMPLATES: Omit<Rule, "id">[] = [
  { name: "VIPs are always important", enabled: true, priority: 10, match: "all", conditions: [{ field: "sender_vip", op: "is_true" }], actions: [{ kind: "set_importance", value: "high" }], stop_processing: false },
  { name: "Newsletters → Read Later", enabled: true, priority: 50, match: "all", conditions: [{ field: "msg_type", op: "equals", value: "newsletter" }], actions: [{ kind: "set_category", value: "read_later" }], stop_processing: false },
  { name: "Remind me if approval requests go unanswered", enabled: true, priority: 60, match: "all", conditions: [{ field: "text", op: "contains", value: ["approve", "approval", "sign off"] }], actions: [{ kind: "track_reply", value: "3" }], stop_processing: false },
  { name: "Suggest a task for explicit deadlines", enabled: true, priority: 70, match: "all", conditions: [{ field: "time_sensitivity", op: "in", value: ["immediate", "today", "this_week"] }, { field: "action", op: "in", value: ["task_required", "review_needed"] }], actions: [{ kind: "suggest_task" }], stop_processing: false },
];
