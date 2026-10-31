"use client";

import { CheckCircle2, FlaskConical, Mail, Plus, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, useAct, type Account } from "./api";
import { useScope } from "./shell";
import { Dialog, Spinner, ago, errText, useToast } from "./ui";

const GMAIL_ERRORS: Record<string, string> = {
  expired: "The connection attempt expired or didn't match this browser. Please try again.",
  access_denied: "You cancelled the Google permission screen.",
  read_permission_not_granted: "InboxPilot needs at least read access to Gmail. Tick the Gmail box on Google's screen.",
  different_account: "Please choose the same Google account you're adding permissions to.",
  no_email: "Google didn't share the account's email address.",
  failed: "Google sign-in failed. Check the server configuration and try again.",
};

export function AccountsPage() {
  const { boot } = useScope();
  const params = useSearchParams();
  const toast = useToast();
  const [newWs, setNewWs] = useState(false);
  const demo = useAct(() => api("/demo", { method: "POST" }), { onSuccess: () => toast({ text: "Demo mailbox loaded. It's clearly marked and fully synthetic.", tone: "ok" }) });
  const removeDemo = useAct(() => api("/demo", { method: "DELETE" }), { onSuccess: () => toast({ text: "Demo data removed.", tone: "ok" }) });
  const err = params.get("gmail_error");

  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Connected accounts</h1>
          <button className="ip-btn ml-auto" onClick={() => setNewWs(true)}><Plus size={14} /> New workspace</button>
        </div>
        {err && <p className="ip-card p-3 text-[13px]" style={{ color: "var(--ip-crit)" }}>{GMAIL_ERRORS[err] ?? `Gmail connection failed (${err}).`}</p>}
        {params.get("gmail") === "connected" && <p className="ip-card p-3 text-[13px]" style={{ color: "var(--ip-low)" }}>Gmail connected. Press “Sync now” to start the first import (InboxPilot also syncs in the background every 10 minutes).</p>}
        {!boot.server.gmail && <p className="ip-card p-3 text-[13px]" style={{ background: "var(--ip-warn-soft)", color: "var(--ip-warn)" }}>Gmail isn&apos;t available on this server yet: {boot.server.gmailReason} See docs/inbox/SETUP.md.</p>}

        {boot.workspaces.map((w) => {
          const accs = boot.accounts.filter((a) => a.workspace_id === w.id);
          const ent = boot.entitlements[w.id];
          return (
            <section key={w.id} className="ip-card">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 ip-line">
                <h2 className="font-semibold">{w.name}</h2>
                <span className="ip-chip">{w.kind}</span>
                {w.is_demo && <span className="ip-chip ip-chip-warn">Demo data</span>}
                {ent && <span className="ip-chip ip-chip-info">{ent.label}</span>}
                <div className="ml-auto flex gap-2">
                  {!w.is_demo && (
                    boot.server.gmail ? (
                      <a className="ip-btn ip-btn-primary ip-btn-sm" href={`/api/inbox/gmail/connect?workspace=${w.id}&level=read`}><Mail size={13} /> Connect Gmail</a>
                    ) : (
                      <button className="ip-btn ip-btn-sm" disabled title={boot.server.gmailReason ?? ""}><Mail size={13} /> Connect Gmail</button>
                    )
                  )}
                  <button className="ip-btn ip-btn-sm" disabled title="Microsoft 365 / Outlook support is planned and not implemented yet.">Outlook (planned)</button>
                </div>
              </div>
              {accs.length ? accs.map((a) => <AccountRow key={a.id} a={a} />) : <p className="ip-muted px-4 py-4 text-[13px]">No accounts in this workspace yet.</p>}
              {w.is_demo && (
                <div className="px-4 pb-3">
                  <button className="ip-btn ip-btn-sm ip-btn-danger" onClick={() => confirm("Remove the demo workspace and all its synthetic data?") && removeDemo.mutate(undefined)}><Trash2 size={13} /> Remove demo</button>
                </div>
              )}
            </section>
          );
        })}

        {!boot.workspaces.some((w) => w.is_demo) && (
          <section className="ip-card flex flex-wrap items-center gap-3 p-4">
            <FlaskConical size={18} style={{ color: "var(--ip-teal)" }} />
            <div className="flex-1">
              <p className="font-medium">Try the demo mailbox</p>
              <p className="ip-muted text-[12.5px]">Loads ~20 synthetic messages into a separate, clearly-labelled Demo workspace. Never mixed with real accounts; sending from it only records locally.</p>
            </div>
            <button className="ip-btn" onClick={() => demo.mutate(undefined, { onError: (e) => toast({ text: errText(e), tone: "error" }) })} disabled={demo.isPending}>{demo.isPending ? <Spinner size={13} /> : null} Load demo</button>
          </section>
        )}

        <section className="ip-card p-4 text-[13px]">
          <h2 className="flex items-center gap-1.5 font-semibold"><ShieldCheck size={16} style={{ color: "var(--ip-teal)" }} /> What InboxPilot can access</h2>
          <ul className="ip-muted mt-2 list-disc space-y-1 pl-5">
            <li><b>Read</b> (gmail.readonly): sync, read and search your mail. Required.</li>
            <li><b>Organize</b> (gmail.modify, optional): labels, archive and read state, only when you approve or an Automatic rule you confirmed runs. InboxPilot never deletes mail and never moves anything to spam or trash.</li>
            <li><b>Send</b> (gmail.send, optional): only after you review the exact message and press Send.</li>
            <li>Tokens are encrypted on the server and never sent to your browser. Disconnecting revokes access with Google and deletes everything InboxPilot stored from that account.</li>
          </ul>
        </section>
      </div>
      <NewWorkspace open={newWs} onClose={() => setNewWs(false)} />
    </div>
  );
}

function AccountRow({ a }: { a: Account }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const r = await api<{ result: { inserted: number; done: boolean; error?: string } }>(`/accounts/${a.id}/sync`, { method: "POST" });
      toast({ text: r.result.error ? r.result.error : `${r.result.inserted} new message(s).${r.result.done ? "" : " Import continues in the next sync."}`, tone: r.result.error ? "error" : "ok" });
    } catch (e) {
      toast({ text: errText(e), tone: "error" });
    }
    setBusy(false);
    void qc.invalidateQueries();
  };
  const upd = useAct((b: Record<string, unknown>) => api(`/accounts/${a.id}`, { method: "PATCH", json: b }));
  const disconnect = useAct(() => api<{ revoked: boolean }>(`/accounts/${a.id}`, { method: "DELETE" }), { onSuccess: (r) => toast({ text: r.revoked ? "Disconnected and data deleted." : "Data deleted. Revoking with Google failed: remove access at myaccount.google.com/permissions.", tone: "ok" }) });
  const st = a.sync_state ?? {};
  const progress = st.phase && st.phase !== "done" ? `Importing: ${st.fetched ?? 0}${st.target ? ` of ~${st.target}` : ""}` : null;
  return (
    <div className="space-y-2 border-b px-4 py-3 ip-line last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Mail size={16} className="ip-muted" />
        <span className="font-medium">{a.email}</span>
        <span className="ip-chip">{a.provider === "demo" ? "demo" : a.provider}</span>
        {a.status === "needs_reconnect" ? <span className="ip-chip ip-chip-high"><TriangleAlert size={11} /> Reconnect needed</span> : a.status === "error" ? <span className="ip-chip ip-chip-high">Sync error</span> : a.status === "paused" ? <span className="ip-chip">Paused</span> : <span className="ip-chip ip-chip-low"><CheckCircle2 size={11} /> Active</span>}
        <span className="ip-muted text-[12px]">{a.last_sync_at ? `synced ${ago(a.last_sync_at)}` : "never synced"}{progress ? ` · ${progress}` : ""}</span>
        <div className="ml-auto flex gap-1.5">
          {a.status === "needs_reconnect" ? (
            <a className="ip-btn ip-btn-sm ip-btn-primary" href={`/api/inbox/gmail/connect?account=${a.id}&level=read`}>Reconnect</a>
          ) : (
            <button className="ip-btn ip-btn-sm" onClick={sync} disabled={busy}><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Sync now</button>
          )}
          <button className="ip-btn ip-btn-sm ip-btn-danger" onClick={() => confirm(`Disconnect ${a.email}?\n\nInboxPilot will revoke its Google access and permanently delete every message, classification, task and follow-up it stored from this account. Your mailbox itself is not changed.`) && disconnect.mutate(undefined)}>Disconnect</button>
        </div>
      </div>
      {a.last_error && <p className="text-[12px]" style={{ color: "var(--ip-crit)" }}>{a.last_error}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
        <span className="ip-muted">Permissions:</span>
        <span>Read {a.capabilities.read ? "✓" : "✗"}</span>
        <span>Organize {a.capabilities.modify ? "✓" : a.provider === "gmail" ? <a className="underline" href={`/api/inbox/gmail/connect?account=${a.id}&level=modify`}>grant</a> : "✗"}</span>
        <span>Send {a.capabilities.send ? "✓" : a.provider === "gmail" ? <a className="underline" href={`/api/inbox/gmail/connect?account=${a.id}&level=send`}>grant</a> : "✗"}</span>
        <label className="flex items-center gap-1.5">
          Automation
          <select className="ip-select !h-7 !w-auto text-[12px]" value={a.automation_mode ?? ""} onChange={(e) => upd.mutate({ automation_mode: e.target.value || null })}>
            <option value="">Use default</option>
            <option value="observe">Observe only</option>
            <option value="assisted">Assisted</option>
            <option value="automatic">Automatic</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          AI may read
          <select className="ip-select !h-7 !w-auto text-[12px]" value={a.settings?.ai_content ?? ""} onChange={(e) => upd.mutate({ ai_content: e.target.value || null })}>
            <option value="">Use default</option>
            <option value="metadata">Headers only</option>
            <option value="snippet">Headers + preview</option>
            <option value="full">Full text</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.status === "paused"} onChange={(e) => upd.mutate({ paused: e.target.checked })} /> Pause sync</label>
      </div>
    </div>
  );
}

function NewWorkspace({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("business");
  const create = useAct(() => api("/workspaces", { method: "POST", json: { name, kind } }), { onSuccess: () => { toast({ text: "Workspace created.", tone: "ok" }); onClose(); } });
  return (
    <Dialog open={open} onClose={onClose} title="New workspace">
      <form className="space-y-2.5 text-[13px]" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined, { onError: (err) => toast({ text: errText(err), tone: "error" }) }); }}>
        <p className="ip-muted">Workspaces keep personal and business mail separate: rules, sender preferences and learning never cross between them.</p>
        <input className="ip-input" placeholder="Name (e.g. Acme Consulting)" value={name} onChange={(e) => setName(e.target.value)} required />
        <select className="ip-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="business">Business</option>
          <option value="personal">Personal</option>
          <option value="team">Team (shared workspace)</option>
        </select>
        <div className="flex justify-end gap-2"><button type="button" className="ip-btn" onClick={onClose}>Cancel</button><button className="ip-btn ip-btn-primary">Create</button></div>
      </form>
    </Dialog>
  );
}
