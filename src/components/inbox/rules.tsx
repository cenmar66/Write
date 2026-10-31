"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, Plus, Trash2, Wand2, X } from "lucide-react";
import { useState } from "react";
import type { Rule, RuleConflict } from "@/lib/inbox/rules";
import { api, ApiError, useAct, type Execution } from "./api";
import { useScope } from "./shell";
import { Dialog, Empty, Skeleton, Spinner, errText, useToast } from "./ui";

const FIELDS: [string, string][] = [
  ["from", "Sender email"], ["from_domain", "Sender domain"], ["sender_vip", "Sender is VIP"], ["to", "To"], ["cc", "Cc"], ["subject", "Subject"], ["text", "Subject or text"],
  ["has_attachment", "Has attachment"], ["is_unread", "Is unread"], ["importance", "Importance"], ["msg_type", "Type"], ["action", "Action needed"],
  ["time_sensitivity", "Time sensitivity"], ["category", "Category"], ["list", "Mailing list id"], ["account_id", "Account"],
];
const BOOL_FIELDS = new Set(["sender_vip", "has_attachment", "is_unread"]);
const OPS: [string, string][] = [["equals", "is"], ["not_equals", "is not"], ["contains", "contains"], ["not_contains", "doesn't contain"], ["ends_with", "ends with"], ["in", "is one of"]];
type Draft = Omit<Rule, "id"> & { id?: string };
const blank = (): Draft => ({ name: "", enabled: true, priority: 100, match: "all", conditions: [{ field: "from_domain", op: "equals", value: "" }], actions: [{ kind: "set_category", value: "read_later" }], stop_processing: false, account_id: null, confirmed_broad: false });

export function RulesPage() {
  const { ws, boot } = useScope();
  const wsList = boot.workspaces;
  const [pick, setPick] = useState<string>(ws !== "all" ? ws : wsList.find((w) => !w.is_demo)?.id ?? wsList[0]?.id ?? "");
  const wsId = ws !== "all" ? ws : pick;
  const [tab, setTab] = useState<"rules" | "history">("rules");
  const q = useQuery({ queryKey: ["rules", wsId], queryFn: () => api<{ rules: Rule[]; catalog: Record<string, { label: string; scope: string; destructive: boolean; needsValue?: string }>; templates: Omit<Rule, "id">[]; conflicts: RuleConflict[] }>(`/rules?ws=${wsId}`), enabled: !!wsId });
  const [edit, setEdit] = useState<Draft | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const upd = useAct((a: { id: string; body: Record<string, unknown> }) => api(`/rules/${a.id}`, { method: "PATCH", json: a.body }));
  const del = useAct((id: string) => api(`/rules/${id}`, { method: "DELETE" }));
  const mode = boot.prefs.automation_mode;

  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Rules</h1>
          {ws === "all" && (
            <select className="ip-select !w-auto" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Workspace">
              {wsList.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          <button className="ip-btn ip-btn-primary ml-auto" onClick={() => setEdit(blank())} disabled={!wsId}><Plus size={14} /> New rule</button>
        </div>
        <p className="ip-muted text-[13px]">
          Rules are deterministic: the same email always gets the same result, and your rules always beat AI suggestions. Automation mode: <b>{mode === "observe" ? "Observe only" : mode === "assisted" ? "Assisted" : "Automatic"}</b>
          {mode === "observe" ? " — rules organize mail inside InboxPilot; mailbox changes are only suggested." : mode === "assisted" ? " — mailbox changes wait for your approval." : " — confirmed, reversible mailbox changes run automatically."}
        </p>
        <div className="flex gap-1" role="tablist">
          <button role="tab" className="ip-tab" aria-selected={tab === "rules"} onClick={() => setTab("rules")}>Rules</button>
          <button role="tab" className="ip-tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>Action history</button>
        </div>
        {tab === "history" ? (
          <History ws={wsId} />
        ) : q.isLoading || !q.data ? (
          <Skeleton rows={4} />
        ) : (
          <>
            {q.data.conflicts.length > 0 && (
              <div className="ip-card p-3 text-[13px]" style={{ borderColor: "var(--ip-warn)" }}>
                <p className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--ip-warn)" }}><AlertTriangle size={15} /> Conflicting rules</p>
                {q.data.conflicts.map((c, i) => {
                  const a = q.data!.rules.find((r) => r.id === c.a)?.name;
                  const b = q.data!.rules.find((r) => r.id === c.b)?.name;
                  return <p key={i}>“{a}” and “{b}” both match {c.examples.length}+ recent messages but set {c.field === "set_category" ? "the category" : "importance"} to {c.values[0]} vs {c.values[1]}. “{a}” wins (higher priority).</p>;
                })}
              </div>
            )}
            <div className="ip-card">
              {q.data.rules.length === 0 ? (
                <Empty icon={Wand2} title="No rules yet">Start from a template below, or create your own.</Empty>
              ) : (
                <ul>
                  {q.data.rules.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 ip-line last:border-0">
                      <input type="checkbox" checked={r.enabled} onChange={(e) => upd.mutate({ id: r.id, body: { enabled: e.target.checked } })} aria-label={`Enable ${r.name}`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{r.name} <span className="ip-muted text-[12px]">· priority {r.priority}</span></p>
                        <p className="ip-muted truncate text-[12px]">
                          If {r.conditions.length ? r.conditions.map((c) => `${FIELDS.find((f) => f[0] === c.field)?.[1] ?? c.field} ${c.op.replace(/_/g, " ")} ${Array.isArray(c.value) ? c.value.join("/") : c.value ?? ""}`).join(r.match === "all" ? " and " : " or ") : "any message"} → {r.actions.map((a) => `${q.data!.catalog[a.kind]?.label ?? a.kind}${a.value ? ` (${a.value})` : ""}`).join(", ")}
                        </p>
                      </div>
                      <button className="ip-btn ip-btn-sm" onClick={() => setEdit(r)}>Edit</button>
                      <button className="ip-btn ip-btn-sm ip-btn-ghost" onClick={() => confirm(`Delete “${r.name}”?`) && del.mutate(r.id)} aria-label="Delete"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <section>
              <h2 className="mb-2 font-semibold">Templates</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {q.data.templates.map((t) => (
                  <button key={t.name} className="ip-card ip-hover p-3 text-left text-[13px]" onClick={() => setEdit({ ...t })}>
                    <p className="font-medium">{t.name}</p>
                    <p className="ip-muted text-[12px]">{t.actions.map((a) => q.data!.catalog[a.kind]?.label).join(", ")}</p>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
      {edit && q.data && <RuleEditor ws={wsId} initial={edit} catalog={q.data.catalog} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void qc.invalidateQueries(); toast({ text: "Rule saved. It applies to new mail.", tone: "ok" }); }} />}
    </div>
  );
}

function RuleEditor({ ws, initial, catalog, onClose, onSaved }: { ws: string; initial: Draft; catalog: Record<string, { label: string; scope: string; destructive: boolean; needsValue?: string }>; onClose: () => void; onSaved: () => void }) {
  const { boot } = useScope();
  const [r, setR] = useState<Draft>(JSON.parse(JSON.stringify(initial)));
  const [preview, setPreview] = useState<{ matchCount: number; sampleSize: number; needsConfirmation: string[]; examples: { id: string; from: string; subject: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cats = [...new Map(boot.categories.filter((c) => c.workspace_id === ws).map((c) => [c.key, c])).values()];
  const set = (p: Partial<Draft>) => setR((x) => ({ ...x, ...p }));
  const clean = (): Draft => ({ ...r, conditions: r.conditions.map((c) => (c.op === "in" && typeof c.value === "string" ? { ...c, value: c.value.split(",").map((s) => s.trim()).filter(Boolean) } : c)) });

  const runPreview = async () => {
    setBusy(true);
    setErr(null);
    try {
      setPreview(await api("/rules/preview", { method: "POST", json: { ws, rule: clean() } }));
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };
  const save = async (confirmed = false) => {
    setBusy(true);
    setErr(null);
    try {
      const rule = { ...clean(), confirmed_broad: confirmed || r.confirmed_broad };
      if (r.id) await api(`/rules/${r.id}`, { method: "PATCH", json: rule });
      else await api("/rules", { method: "POST", json: { ws, rule } });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.data.needsConfirmation)) {
        if (confirm(`Please confirm:\n\n${(e.data.needsConfirmation as string[]).join("\n")}\n\nCreate this rule?`)) return save(true);
      } else setErr(errText(e));
    }
    setBusy(false);
  };

  return (
    <Dialog open title={r.id ? "Edit rule" : "New rule"} onClose={onClose} wide>
      <div className="space-y-3 text-[13px]">
        <input className="ip-input" placeholder="Rule name" value={r.name} onChange={(e) => set({ name: e.target.value })} aria-label="Rule name" />
        <div className="flex flex-wrap items-center gap-2">
          If
          <select className="ip-select !w-auto" value={r.match} onChange={(e) => set({ match: e.target.value as "all" | "any" })}><option value="all">all</option><option value="any">any</option></select>
          of these are true
          <select className="ip-select !w-auto" value={r.account_id ?? ""} onChange={(e) => set({ account_id: e.target.value || null })} aria-label="Account">
            <option value="">for every account</option>
            {boot.accounts.filter((a) => a.workspace_id === ws).map((a) => <option key={a.id} value={a.id}>only {a.email}</option>)}
          </select>
        </div>
        {r.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <select className="ip-select !w-44" value={c.field} onChange={(e) => { const cs = [...r.conditions]; cs[i] = { field: e.target.value as never, op: BOOL_FIELDS.has(e.target.value) ? "is_true" : "equals", value: "" }; set({ conditions: cs }); }} aria-label="Field">
              {FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {BOOL_FIELDS.has(c.field) ? (
              <select className="ip-select !w-28" value={c.op} onChange={(e) => { const cs = [...r.conditions]; cs[i] = { ...c, op: e.target.value as never }; set({ conditions: cs }); }}><option value="is_true">yes</option><option value="is_false">no</option></select>
            ) : (
              <>
                <select className="ip-select !w-36" value={c.op} onChange={(e) => { const cs = [...r.conditions]; cs[i] = { ...c, op: e.target.value as never }; set({ conditions: cs }); }} aria-label="Operator">
                  {OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <input className="ip-input !w-auto flex-1" placeholder={c.op === "in" ? "comma, separated" : "value"} value={Array.isArray(c.value) ? c.value.join(", ") : c.value ?? ""} onChange={(e) => { const cs = [...r.conditions]; cs[i] = { ...c, value: e.target.value }; set({ conditions: cs }); }} aria-label="Value" />
              </>
            )}
            <button className="ip-btn ip-btn-ghost ip-btn-sm" onClick={() => set({ conditions: r.conditions.filter((_, j) => j !== i) })} aria-label="Remove condition"><X size={14} /></button>
          </div>
        ))}
        <button className="ip-btn ip-btn-sm" onClick={() => set({ conditions: [...r.conditions, { field: "subject", op: "contains", value: "" }] })}><Plus size={13} /> Condition</button>
        <p className="font-medium">Then</p>
        {r.actions.map((a, i) => {
          const meta = catalog[a.kind];
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className="ip-select !w-64" value={a.kind} onChange={(e) => { const as = [...r.actions]; as[i] = { kind: e.target.value as never, value: "" }; set({ actions: as }); }} aria-label="Action">
                {Object.entries(catalog).map(([k, m]) => <option key={k} value={k}>{m.label}{m.scope === "provider" ? " (mailbox)" : ""}</option>)}
              </select>
              {meta?.needsValue === "importance" && <select className="ip-select !w-32" value={a.value ?? ""} onChange={(e) => { const as = [...r.actions]; as[i] = { ...a, value: e.target.value }; set({ actions: as }); }}><option value="">…</option>{["critical", "high", "normal", "low"].map((x) => <option key={x}>{x}</option>)}</select>}
              {meta?.needsValue === "category" && <select className="ip-select !w-44" value={a.value ?? ""} onChange={(e) => { const as = [...r.actions]; as[i] = { ...a, value: e.target.value }; set({ actions: as }); }}><option value="">…</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>}
              {(meta?.needsValue === "days" || meta?.needsValue === "label") && <input className="ip-input !w-32" type={meta.needsValue === "days" ? "number" : "text"} value={a.value ?? ""} onChange={(e) => { const as = [...r.actions]; as[i] = { ...a, value: e.target.value }; set({ actions: as }); }} placeholder={meta.needsValue} />}
              {meta?.destructive && <span className="ip-chip ip-chip-warn">changes your mailbox · reversible</span>}
              <button className="ip-btn ip-btn-ghost ip-btn-sm" onClick={() => set({ actions: r.actions.filter((_, j) => j !== i) })} aria-label="Remove action"><X size={14} /></button>
            </div>
          );
        })}
        <button className="ip-btn ip-btn-sm" onClick={() => set({ actions: [...r.actions, { kind: "set_importance", value: "high" }] })}><Plus size={13} /> Action</button>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">Priority <input type="number" className="ip-input !w-20" value={r.priority} onChange={(e) => set({ priority: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={r.stop_processing} onChange={(e) => set({ stop_processing: e.target.checked })} /> Stop other rules after this one</label>
        </div>
        <p className="ip-muted text-[12px]">Lower priority numbers run first. When two rules set the same thing, the first one wins.</p>
        {preview && (
          <div className="rounded-xl border p-3 ip-line" style={{ background: "var(--ip-surface-2)" }}>
            <p className="font-semibold">What will change? {preview.matchCount} of the last {preview.sampleSize} messages match.</p>
            {preview.needsConfirmation.map((n) => <p key={n} style={{ color: "var(--ip-warn)" }}>• {n}</p>)}
            <ul className="ip-muted mt-1 text-[12px]">{preview.examples.map((x) => <li key={x.id}>{x.from}: {x.subject}</li>)}</ul>
            <p className="ip-muted mt-1 text-[12px]">Preview only. Nothing was changed. Rules apply to new mail.</p>
          </div>
        )}
        {err && <p style={{ color: "var(--ip-crit)" }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="ip-btn" onClick={runPreview} disabled={busy}><Eye size={14} /> Preview</button>
          <button className="ip-btn ip-btn-primary" onClick={() => save()} disabled={busy}>{busy && <Spinner size={13} />} Save rule</button>
        </div>
      </div>
    </Dialog>
  );
}

function History({ ws }: { ws: string }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ["executions", ws, "all"], queryFn: () => api<{ executions: Execution[]; audit: { id: number; actor: string; action: string; target: string | null; created_at: string; detail: Record<string, unknown> }[] }>(`/executions?ws=${ws}`) });
  const act = useAct((a: { id: string; op: string }) => api("/executions", { method: "POST", json: a }));
  if (q.isLoading || !q.data) return <Skeleton rows={4} />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="ip-card p-4">
        <h2 className="mb-2 font-semibold">Rule actions</h2>
        <ul className="space-y-2 text-[12.5px]">
          {q.data.executions.slice(0, 80).map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className={`ip-chip ${e.status === "applied" || e.status === "approved" ? "ip-chip-low" : e.status === "suggested" ? "ip-chip-info" : e.status === "failed" ? "ip-chip-high" : ""}`}>{e.status}</span>
              <span className="min-w-0 flex-1 truncate">{e.action.kind.replace(/_/g, " ")} · {e.message?.subject ?? "—"} <span className="ip-muted">({e.rule_name})</span></span>
              {(e.status === "applied" || e.status === "approved") && !!e.undo && <button className="ip-btn ip-btn-sm" onClick={() => act.mutate({ id: e.id, op: "undo" }, { onError: (er) => toast({ text: errText(er), tone: "error" }) })}>Undo</button>}
            </li>
          ))}
          {!q.data.executions.length && <li className="ip-muted">No rule actions yet.</li>}
        </ul>
      </section>
      <section className="ip-card p-4">
        <h2 className="mb-2 font-semibold">Audit log</h2>
        <ul className="space-y-1 text-[12px]">
          {q.data.audit.map((a) => (
            <li key={a.id}><span className="ip-muted">{new Date(a.created_at).toLocaleString()}</span> · <b>{a.actor}</b> {a.action}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
