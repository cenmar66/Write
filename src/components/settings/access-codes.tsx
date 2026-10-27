"use client";

import { Check, Copy, KeyRound, Loader2, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Code = {
  id: string;
  name: string;
  token_prefix: string;
  scope: "read" | "write";
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

const EXPIRY = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Never", days: null },
];

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Settings: access codes (API keys) for an AI assistant. */
export function AccessCodes() {
  const supabase = useMemo(() => createClient(), []);
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("My assistant");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [days, setDays] = useState<number | null>(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("access_tokens")
      .select("id,name,token_prefix,scope,expires_at,last_used_at,revoked_at,created_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    return (data as Code[]) ?? [];
  }, [supabase]);

  useEffect(() => {
    load().then((c) => {
      setCodes(c);
      setOrigin(window.location.origin);
    });
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scope, days }),
      });
      const body = (await res.json()) as { token?: string; error?: string };
      if (!body.token) throw new Error(body.error || "Couldn't create the code.");
      setFresh(body.token);
      setCreating(false);
      setCodes(await load());
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this code? Anything using it stops working right away.")) return;
    await supabase.from("access_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    setCodes((c) => c?.filter((x) => x.id !== id) ?? null);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const example = `curl ${origin}/api/v1/documents \\\n  -H "Authorization: Bearer ${fresh ?? "wai_…"}"`;

  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Access codes for assistants</h2>
          <p className="max-w-lg text-sm text-muted">
            Let your AI assistant read (and, if you allow it, write) your documents, without sharing your login. Revoke a code any time.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => {
              setCreating(true);
              setFresh(null);
            }}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm ring-1 ring-line hover:bg-surface-strong"
          >
            <Plus size={15} /> New code
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4 space-y-3 rounded-2xl bg-surface-strong p-4">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <div className="text-sm">
            <span className="font-medium">What can it do?</span>
            <div className="mt-1 flex flex-wrap gap-2">
              <Choice active={scope === "read"} onClick={() => setScope("read")}>Read only</Choice>
              <Choice active={scope === "write"} onClick={() => setScope("write")}>Read and write</Choice>
            </div>
            <p className="mt-1 text-xs text-muted">
              {scope === "write" ? "Can create, edit, and trash documents. Every edit is saved in History first." : "Can list, search, and read documents and styles."}
            </p>
          </div>
          <div className="text-sm">
            <span className="font-medium">Expires after</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {EXPIRY.map((e) => (
                <Choice key={e.label} active={days === e.days} onClick={() => setDays(e.days)}>
                  {e.label}
                </Choice>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy || !name.trim()}
              className="bg-gradient-brand flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Create code
            </button>
            <button onClick={() => setCreating(false)} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {fresh && (
        <div role="status" className="mt-4 space-y-2 rounded-2xl bg-neutral-500/10 p-4 text-sm">
          <p className="font-medium text-neutral-900 dark:text-neutral-200">Copy this code now. You won’t see it again.</p>
          <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2 ring-1 ring-line">
            <code className="min-w-0 flex-1 truncate">{fresh}</code>
            <button onClick={() => copy(fresh, "code")} aria-label="Copy code" className="rounded-lg p-1.5 text-muted hover:text-ink">
              {copied === "code" ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <p className="text-muted">Give your assistant the code and this web address: <code>{origin}/api/v1</code></p>
          <pre className="overflow-x-auto rounded-xl bg-bg p-3 text-xs ring-1 ring-line">{example}</pre>
          <button onClick={() => setFresh(null)} className="text-xs text-muted hover:text-ink">I’ve saved it</button>
        </div>
      )}

      <ul className="mt-4 divide-y divide-line">
        {codes === null && <li className="py-4 text-center text-muted"><Loader2 className="mx-auto animate-spin" size={18} /></li>}
        {codes?.length === 0 && !creating && <li className="py-3 text-sm text-muted">No codes yet.</li>}
        {codes?.map((c) => {
          const expired = c.expires_at && new Date(c.expires_at) < new Date();
          return (
            <li key={c.id} className="flex items-center gap-3 py-3 text-sm">
              <KeyRound size={16} className="shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {c.name} <span className="ml-1 rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-normal text-muted">{c.scope === "write" ? "read & write" : "read only"}</span>
                </p>
                <p className="truncate text-xs text-muted">
                  <code>{c.token_prefix}…</code> · {c.last_used_at ? `last used ${fmt(c.last_used_at)}` : "never used"} ·{" "}
                  {expired ? <span className="text-red-700 dark:text-red-400">expired</span> : c.expires_at ? `expires ${fmt(c.expires_at)}` : "never expires"}
                </p>
              </div>
              <button onClick={() => revoke(c.id)} aria-label={`Revoke ${c.name}`} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-red-700 dark:text-red-400 ring-1 ring-line hover:bg-surface-strong">
                <X size={13} /> Revoke
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 transition ${active ? "bg-ink text-bg" : "bg-bg ring-1 ring-line hover:bg-surface-strong"}`}
    >
      {children}
    </button>
  );
}
