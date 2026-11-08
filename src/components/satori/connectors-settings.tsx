"use client";

// Settings → Connected apps: MCP servers Claude can use in the Testing Lab.
import { Plug, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Connector } from "@/lib/satori/store/types";
import { api } from "./client";
import { useSatori } from "./provider";
import { Dialog, ErrorBox, Field, Notice, Spinner } from "./ui";

type Draft = { id?: string; label: string; url: string; token: string; hasToken: boolean; clearToken: boolean; enabled: boolean };
const EMPTY: Draft = { label: "", url: "", token: "", hasToken: false, clearToken: false, enabled: true };

export function ConnectorsSettings() {
  const { toast } = useSatori();
  const [list, setList] = useState<Connector[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api<{ connectors: Connector[] }>("/api/satori/connectors")).connectors);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setList([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set after the request resolves
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    try {
      // Token: new value replaces; "" removes; omitted keeps what's saved.
      const token = draft.token.trim() ? draft.token.trim() : draft.clearToken ? "" : undefined;
      const body = { label: draft.label, url: draft.url, enabled: draft.enabled, ...(token !== undefined ? { token } : {}) };
      await api(draft.id ? `/api/satori/connectors/${draft.id}` : "/api/satori/connectors", { method: draft.id ? "PATCH" : "POST", body });
      toast(draft.id ? "Connected app updated" : "App connected", "ok");
      setDraft(null);
      void load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Connector) {
    try {
      await api(`/api/satori/connectors/${c.id}`, { method: "PATCH", body: { label: c.label, url: c.url, enabled: !c.enabled } });
      void load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove(c: Connector) {
    if (!confirm(`Disconnect “${c.label}”? Its saved token is deleted too.`)) return;
    try {
      await api(`/api/satori/connectors/${c.id}`, { method: "DELETE" });
      toast("Disconnected", "ok");
      void load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-3">
      <Notice tone="neutral">
        Connect apps that offer an <strong>MCP server</strong> (most AI-ready apps do, such as Notion, Linear, Asana, Zapier and many others — look for “MCP server URL” in the app&apos;s developer or AI settings). Claude can then use them when you run a prompt in the Testing Lab. Use servers that accept an access token or API key; ones that only offer a browser login can&apos;t be connected yet.
      </Notice>
      <Notice tone="warn">
        Connected apps can take real actions, like creating pages or tasks, if the prompt asks for it. Only connect apps you trust, and give tokens the least access you need.
      </Notice>
      {error && <ErrorBox message={error} onRetry={load} />}
      {list === null ? (
        <Spinner label="Loading…" />
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 ps-line">
              <Plug size={16} className="ps-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.label}</span>
                <span className="block truncate text-xs ps-muted">
                  {c.url} · {c.has_token ? "token saved" : "no token"}
                </span>
              </span>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--ps-accent)]" checked={c.enabled} onChange={() => toggle(c)} />
                On
              </label>
              <button type="button" className="ps-btn ps-btn-sm" onClick={() => setDraft({ id: c.id, label: c.label, url: c.url, token: "", hasToken: c.has_token, clearToken: false, enabled: c.enabled })}>
                Edit
              </button>
              <button type="button" className="ps-btn ps-btn-sm ps-btn-ghost ps-btn-icon" aria-label={`Disconnect ${c.label}`} onClick={() => remove(c)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ps-btn" onClick={() => { setFormError(null); setDraft({ ...EMPTY }); }}>
        <Plug size={15} aria-hidden /> Connect an app
      </button>

      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit connected app" : "Connect an app"}>
        {draft && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label="Name" hint="Shown in the Testing Lab, e.g. “Notion”." htmlFor="cx-label">
              <input id="cx-label" className="ps-input" required maxLength={60} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </Field>
            <Field label="MCP server URL" hint="Starts with https://. Find it in the app's developer or AI settings." htmlFor="cx-url">
              <input id="cx-url" className="ps-input" required type="url" inputMode="url" placeholder="https://…" maxLength={500} value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            </Field>
            <Field label={draft.hasToken ? "Access token (leave blank to keep the saved one)" : "Access token or API key (optional)"} hint="Stored encrypted on the server. It's never shown again or sent to your browser." htmlFor="cx-token">
              <input id="cx-token" className="ps-input" type="password" autoComplete="off" maxLength={4000} value={draft.token} onChange={(e) => setDraft({ ...draft, token: e.target.value })} />
            </Field>
            {draft.hasToken && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--ps-accent)]" checked={draft.clearToken} onChange={(e) => setDraft({ ...draft, clearToken: e.target.checked })} />
                Remove the saved token
              </label>
            )}
            {formError && <ErrorBox message={formError} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="ps-btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="ps-btn ps-btn-primary" disabled={saving || !draft.label.trim() || !draft.url.trim()}>
                {saving ? <Spinner size={14} label="Saving…" /> : "Save"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
