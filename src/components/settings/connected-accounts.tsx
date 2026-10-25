"use client";

import { AlertTriangle, Check, ExternalLink, Loader2, Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformBadge } from "@/components/social/platform-badge";
import { createClient } from "@/lib/supabase/client";

type Row = {
  platform: "linkedin" | "facebook" | "instagram" | "threads" | "substack";
  account_name: string;
  avatar_url: string | null;
  status: "connected" | "error" | "expired";
  last_error: string | null;
  meta: {
    authors?: { urn: string; name: string }[];
    author_urn?: string;
    login?: string;
    pages?: { id: string; name: string; instagram: { username?: string } | null }[];
  };
};

export function ConnectedAccounts() {
  const supabase = useMemo(() => createClient(), []);
  const params = useSearchParams();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("connected_accounts").select("platform,account_name,avatar_url,status,last_error,meta");
    return (data as Row[]) ?? [];
  }, [supabase]);
  useEffect(() => {
    load().then(setRows);
  }, [load]);

  const get = (p: Row["platform"]) => rows?.find((r) => r.platform === p);

  async function disconnect(platform: string) {
    if (!confirm("Disconnect this account? Scheduled posts for it won't go out until you reconnect.")) return;
    setBusy(platform);
    await fetch("/api/connect/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) });
    setRows(await load());
    setBusy(null);
  }

  async function choose(platform: "linkedin" | "facebook", value: string) {
    setBusy(platform);
    await fetch("/api/connect/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, value }) });
    setRows(await load());
    setBusy(null);
  }

  const error = params.get("connect_error");
  const connected = params.get("connected");
  const fb = get("facebook");
  const li = get("linkedin");
  const ig = get("instagram");
  const igDirect = ig?.meta.login === "instagram" ? ig : undefined;

  return (
    <section id="accounts" className="glass scroll-mt-6 rounded-3xl p-5 sm:p-6">
      <h2 className="font-medium">Connected accounts</h2>
      <p className="mb-4 text-sm text-muted">Where your posts can go out automatically.</p>

      {connected && !error && (
        <p className="mb-3 flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
          <Check size={15} /> Connected.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-2xl bg-rose-500/10 px-4 py-2.5 text-sm text-rose-600 dark:text-rose-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error === "unknown" ? "Something went wrong. Try again." : error}
        </p>
      )}

      <SetupChecklist />

      {rows === null ? (
        <div className="py-6 text-center text-muted"><Loader2 className="mx-auto animate-spin" /></div>
      ) : (
        <div className="divide-y divide-line">
          <AccountRow
            badges={["linkedin"]}
            title="LinkedIn"
            row={li}
            connectHref="/api/connect/linkedin/start"
            busy={busy === "linkedin"}
            onDisconnect={() => disconnect("linkedin")}
            extra={
              li && (li.meta.authors?.length ?? 0) > 1 ? (
                <Picker label="Post as" value={li.meta.author_urn ?? ""} options={li.meta.authors!.map((a) => ({ value: a.urn, label: a.name }))} onChange={(v) => choose("linkedin", v)} />
              ) : li ? (
                <p className="text-xs text-muted">Company page posting turns on once LinkedIn approves your app (see the README).</p>
              ) : null
            }
          />
          <AccountRow
            badges={["facebook", "instagram"]}
            title="Facebook + Instagram"
            row={fb}
            secondary={igDirect ? undefined : ig}
            secondaryNote={igDirect ? "connected separately below" : undefined}
            connectHref="/api/connect/meta/start"
            connectLabel="Connect with Facebook"
            busy={busy === "facebook"}
            onDisconnect={() => disconnect("facebook")}
            extra={
              fb && (fb.meta.pages?.length ?? 0) > 1 ? (
                <Picker
                  label="Page"
                  value={fb.meta.pages!.find((p) => p.name === fb.account_name)?.id ?? ""}
                  options={fb.meta.pages!.map((p) => ({ value: p.id, label: p.instagram ? `${p.name} · @${p.instagram.username}` : p.name }))}
                  onChange={(v) => choose("facebook", v)}
                />
              ) : null
            }
          />
          <AccountRow
            badges={["instagram"]}
            title="Instagram (without Facebook)"
            row={igDirect}
            connectHref="/api/connect/instagram/start"
            connectLabel="Connect Instagram"
            busy={busy === "instagram"}
            onDisconnect={() => disconnect("instagram")}
            extra={!igDirect ? <p className="text-xs text-muted">For a Business or Creator account. No Facebook Page needed.</p> : null}
          />
          <AccountRow
            badges={["threads"]}
            title="Threads"
            row={get("threads")}
            connectHref="/api/connect/threads/start"
            busy={busy === "threads"}
            onDisconnect={() => disconnect("threads")}
          />
          <SubstackRow row={get("substack")} busy={busy === "substack"} onDisconnect={() => disconnect("substack")} onSaved={async () => setRows(await load())} />
          <div className="flex items-center gap-3 py-4">
            <PlatformBadge platform="x" />
            <div className="flex-1">
              <p className="font-medium">X</p>
              <p className="text-sm text-muted">Shared by hand: one tap copies your post and opens X. No connection needed.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusLine({ row }: { row?: Row }) {
  if (!row) return <span className="text-muted">Not connected</span>;
  if (row.status !== "connected")
    return (
      <span className="text-rose-600 dark:text-rose-300">
        Needs reconnecting{row.last_error ? `: ${row.last_error}` : ""}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
      <Check size={13} /> {row.account_name}
    </span>
  );
}

function AccountRow({
  badges,
  title,
  row,
  secondary,
  secondaryNote,
  connectHref,
  connectLabel,
  busy,
  onDisconnect,
  extra,
}: {
  badges: ("linkedin" | "facebook" | "instagram" | "threads")[];
  title: string;
  row?: Row;
  secondary?: Row;
  secondaryNote?: string;
  connectHref: string;
  connectLabel?: string;
  busy: boolean;
  onDisconnect: () => void;
  extra?: React.ReactNode;
}) {
  const needsReconnect = row && row.status !== "connected";
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
      <div className="flex shrink-0 gap-1">{badges.map((b) => <PlatformBadge key={b} platform={b} />)}</div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{title}</p>
        <StatusLine row={row} />
        {badges.includes("instagram") && badges.includes("facebook") && row && (
          <span className="mt-0.5 block text-xs">
            Instagram:{" "}
            {secondaryNote ? (
              <span className="text-muted">{secondaryNote}</span>
            ) : secondary ? (
              <StatusLine row={secondary} />
            ) : (
              <span className="text-muted">no Business account linked to this Page</span>
            )}
          </span>
        )}
        {extra && <div className="mt-2">{extra}</div>}
      </div>
      <div className="flex shrink-0 gap-2">
        {(!row || needsReconnect) && (
          <a href={connectHref} className="bg-gradient-brand rounded-full px-4 py-2 text-sm font-medium text-white">
            {needsReconnect ? "Reconnect" : (connectLabel ?? "Connect")}
          </a>
        )}
        {row && (
          <button onClick={onDisconnect} disabled={busy} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted ring-1 ring-line hover:text-rose-500">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />} Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function Picker({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-64 rounded-lg bg-bg px-2 py-1 text-sm text-ink ring-1 ring-line">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubstackRow({ row, busy, onDisconnect, onSaved }: { row?: Row; busy: boolean; onDisconnect: () => void; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [cookie, setCookie] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsReconnect = row && row.status !== "connected";

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/connect/substack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cookie, subdomain }) });
    const body = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) return setError(body.error ?? "That didn't work.");
    setCookie("");
    setOpen(false);
    onSaved();
  }

  return (
    <div className="py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#ff6719] text-xs font-semibold text-white">S</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Substack <span className="font-normal text-muted">(drafts only)</span></p>
          <StatusLine row={row} />
        </div>
        <div className="flex shrink-0 gap-2">
          {(!row || needsReconnect) && (
            <button onClick={() => setOpen(!open)} className="bg-gradient-brand rounded-full px-4 py-2 text-sm font-medium text-white">
              {needsReconnect ? "Reconnect" : "Connect"}
            </button>
          )}
          {row && (
            <button onClick={onDisconnect} disabled={busy} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted ring-1 ring-line hover:text-rose-500">
              <Unplug size={14} /> Disconnect
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-2 rounded-2xl bg-surface-strong p-4 text-sm">
          <p className="text-muted">
            Substack has no official API, so this uses your login cookie to create <b>drafts only</b>. It’s stored encrypted. If it ever stops working, use “Copy formatted + open Substack” instead.
          </p>
          <details className="text-muted">
            <summary className="cursor-pointer text-ink">How do I find my cookie?</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>On a computer, open substack.com in Chrome and make sure you’re signed in.</li>
              <li>Press F12 (or right-click → Inspect), then open the <b>Application</b> tab.</li>
              <li>In the left sidebar: Cookies → https://substack.com.</li>
              <li>Find <b>substack.sid</b> and copy its Value (a long string).</li>
            </ol>
          </details>
          <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="Publication subdomain (optional), e.g. yourname" className="w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent" />
          <input value={cookie} onChange={(e) => setCookie(e.target.value)} placeholder="substack.sid value" type="password" autoComplete="off" className="w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent" />
          {error && <p className="text-rose-500">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving || !cookie.trim()} className="bg-gradient-brand rounded-full px-4 py-2 font-medium text-white disabled:opacity-50">
              {saving ? "Checking…" : "Save and test"}
            </button>
            <a href="https://substack.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-muted hover:text-ink">
              Open Substack <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

type Status = {
  shared: Record<string, boolean>;
  platforms: Record<string, { keys: Record<string, boolean>; redirect: string }>;
};

const PLATFORM_NAMES: Record<string, string> = {
  meta: "Facebook + Instagram",
  instagram: "Instagram without Facebook (optional)",
  linkedin: "LinkedIn",
  threads: "Threads",
};
const SHARED_HINTS: Record<string, string> = {
  ENCRYPTION_KEY: "any long random password, 40+ characters (needed for every account, including Substack)",
  SUPABASE_SECRET_KEY: "Supabase → Project Settings → API Keys → Secret keys",
  CRON_SECRET: "another long random password (for scheduled posts)",
};

/** Shows which publishing keys Vercel has (yes/no only) and the exact addresses to paste into each developer app. */
function SetupChecklist() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/connect/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => {
        setStatus(s);
        if (s) {
          // The direct-Instagram keys are optional, so they don't pop the checklist open.
          const missing =
            Object.values(s.shared).includes(false) ||
            Object.entries(s.platforms).some(([name, p]) => name !== "instagram" && Object.values(p.keys).includes(false));
          setOpen(missing);
        }
      });
  }, []);
  if (!status) return null;

  const allKeys = [...Object.values(status.shared), ...Object.values(status.platforms).flatMap((p) => Object.values(p.keys))];
  const done = allKeys.filter(Boolean).length;
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };
  const Row = ({ name, ok, hint }: { name: string; ok: boolean; hint?: string }) => (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] text-white ${ok ? "bg-emerald-500" : "bg-rose-400"}`}>{ok ? "✓" : "!"}</span>
      <span className="min-w-0">
        <code className="text-xs">{name}</code>
        {!ok && hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </li>
  );

  return (
    <div className="mb-4 rounded-2xl bg-surface-strong p-4 text-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="font-medium">Setup checklist</span>
        <span className="text-xs text-muted">
          {done} of {allKeys.length} keys set in Vercel · {open ? "hide" : "show"}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted">Needed for everything</p>
            <ul className="mt-1.5 space-y-1.5">
              {Object.entries(status.shared).map(([k, ok]) => <Row key={k} name={k} ok={ok} hint={SHARED_HINTS[k]} />)}
            </ul>
          </div>
          {Object.entries(status.platforms).map(([p, info]) => (
            <div key={p}>
              <p className="text-xs font-medium text-muted">{PLATFORM_NAMES[p] ?? p}</p>
              <ul className="mt-1.5 space-y-1.5">
                {Object.entries(info.keys).map(([k, ok]) => <Row key={k} name={k} ok={ok} />)}
              </ul>
              <p className="mt-2 text-xs text-muted">Paste this as the redirect address in the developer app:</p>
              <button onClick={() => copy(info.redirect)} className="mt-1 flex w-full items-center gap-2 rounded-xl bg-bg px-3 py-2 text-left text-xs ring-1 ring-line hover:ring-accent">
                <code className="min-w-0 flex-1 truncate">{info.redirect}</code>
                <span className="shrink-0 text-muted">{copied === info.redirect ? "Copied" : "Copy"}</span>
              </button>
            </div>
          ))}
          <p className="text-xs text-muted">
            Add keys in Vercel → Settings → Environment Variables, then redeploy. Step-by-step instructions are in the README under “Setup for publishing”.
          </p>
        </div>
      )}
    </div>
  );
}
