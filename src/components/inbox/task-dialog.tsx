"use client";

import { useEffect, useState } from "react";
import type { MessageRow } from "@/lib/inbox/types";
import { api, useAct } from "./api";
import { useScope } from "./shell";
import { Dialog, Provenance, Spinner, errText, useToast } from "./ui";

interface Suggestion {
  title: string;
  description: string;
  due_date: string | null;
  priority: string;
  project: string | null;
  provenance: Record<string, string>;
  evidence: string | null;
}

/** Email → task. Suggested values show whether they were stated in the email or inferred. */
export function TaskDialog({ open, messageId, onClose }: { open: boolean; messageId: string | null; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Create task">
      <TaskForm messageId={messageId} onClose={onClose} />
    </Dialog>
  );
}

const BLANK: Suggestion = { title: "", description: "", due_date: null, priority: "normal", project: null, provenance: {}, evidence: null };
const formFrom = (s: Suggestion) => ({ title: s.title, description: s.description, due_date: s.due_date ?? "", priority: s.priority, project: s.project ?? "", assignee: "", notes: "" });

// Mounted fresh each time the dialog opens (Dialog renders children only while open).
function TaskForm({ messageId, onClose }: { messageId: string | null; onClose: () => void }) {
  const toast = useToast();
  const { ws } = useScope();
  const [s, setS] = useState<Suggestion | null>(messageId ? null : BLANK);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [form, setForm] = useState(formFrom(BLANK));
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!messageId) return;
    api<{ suggestion: Suggestion; ai: { used: boolean; note?: string } }>("/tasks/suggest", { method: "POST", json: { message_id: messageId } })
      .then((r) => {
        setS(r.suggestion);
        setAiNote(r.ai.used ? null : r.ai.note ?? null);
        setForm(formFrom(r.suggestion));
      })
      .catch((e) => toast({ text: errText(e), tone: "error" }));
  }, [messageId, toast]);

  const create = useAct(() => {
    const provenance: Record<string, string> = {};
    for (const [k, v] of Object.entries(s?.provenance ?? {})) provenance[k] = touched.has(k) ? "user" : v;
    for (const k of touched) provenance[k] = "user";
    return api("/tasks", { method: "POST", json: { ...form, due_date: form.due_date || null, message_id: messageId, ws: ws === "all" ? undefined : ws, provenance } });
  }, { onSuccess: () => { toast({ text: "Task created.", tone: "ok" }); onClose(); } });

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setTouched((t) => new Set(t).add(k));
  };
  const prov = (k: string) => (touched.has(k) ? "user" : s?.provenance[k]);

  return (
    <>
      {!s ? (
        <Spinner />
      ) : (
        <form className="space-y-2.5 text-[13px]" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined, { onError: (err) => toast({ text: errText(err), tone: "error" }) }); }}>
          {aiNote && <p className="ip-muted text-[12px]">Suggested without AI ({aiNote}).</p>}
          <L label="Title" p={prov("title")}><input className="ip-input" required value={form.title} onChange={(e) => set("title", e.target.value)} /></L>
          <L label="Due date" p={form.due_date ? prov("due_date") : undefined}>
            <input type="date" className="ip-input" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </L>
          {s.evidence && !touched.has("due_date") && <p className="ip-muted text-[12px]">From the email: “{s.evidence}”</p>}
          <div className="grid grid-cols-2 gap-2">
            <L label="Priority" p={prov("priority")}>
              <select className="ip-select" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                {["low", "normal", "high", "urgent"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </L>
            <L label="Project"><input className="ip-input" value={form.project} onChange={(e) => set("project", e.target.value)} /></L>
          </div>
          <L label="Assigned to"><input className="ip-input" placeholder="Me" value={form.assignee} onChange={(e) => set("assignee", e.target.value)} /></L>
          <L label="Description"><textarea className="ip-textarea !min-h-[70px]" value={form.description} onChange={(e) => set("description", e.target.value)} /></L>
          <L label="Notes"><textarea className="ip-textarea !min-h-[50px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></L>
          {messageId && <p className="ip-muted text-[12px]">The task keeps a permanent link to this email.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="ip-btn" onClick={onClose}>Cancel</button>
            <button className="ip-btn ip-btn-primary" disabled={create.isPending}>{create.isPending && <Spinner size={13} />} Create task</button>
          </div>
        </form>
      )}
    </>
  );
}

function L({ label, p, children }: { label: string; p?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-[12px] font-medium">{label} <Provenance kind={p} /></span>
      {children}
    </label>
  );
}

type FuMessage = Pick<MessageRow, "id" | "workspace_id" | "subject" | "from_email" | "is_sent" | "to_addrs">;

export function FollowupDialog({ open, message, onClose }: { open: boolean; message: FuMessage; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add follow-up">
      <FollowupForm message={message} onClose={onClose} />
    </Dialog>
  );
}

function FollowupForm({ message, onClose }: { message: FuMessage; onClose: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState(message.is_sent ? "they_owe" : "i_owe");
  const [title, setTitle] = useState(message.is_sent ? `Waiting on ${message.to_addrs?.[0]?.email ?? "reply"}: ${message.subject}` : `Reply to ${message.from_email}: ${message.subject}`);
  const [due, setDue] = useState(() => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  const create = useAct(() => api("/followups", { method: "POST", json: { ws: message.workspace_id, message_id: message.id, kind, title, due_at: due ? `${due}T17:00:00` : null, counterpart: message.is_sent ? message.to_addrs?.[0]?.email : message.from_email } }), {
    onSuccess: () => { toast({ text: "Follow-up added.", tone: "ok" }); onClose(); },
  });
  return (
      <form className="space-y-2.5 text-[13px]" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined, { onError: (err) => toast({ text: errText(err), tone: "error" }) }); }}>
        <select className="ip-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="i_owe">I owe someone</option>
          <option value="they_owe">Someone owes me</option>
          <option value="commitment">Commitment</option>
        </select>
        <input className="ip-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="What to track" required />
        <label className="block"><span className="mb-1 block text-[12px] font-medium">Remind me on</span><input type="date" className="ip-input" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <div className="flex justify-end gap-2">
          <button type="button" className="ip-btn" onClick={onClose}>Cancel</button>
          <button className="ip-btn ip-btn-primary">Add</button>
        </div>
      </form>
  );
}
