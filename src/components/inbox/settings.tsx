"use client";

import { Download, Moon, Sun, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Preferences } from "@/lib/inbox/types";
import { api, useAct } from "./api";
import { useScope } from "./shell";
import { Dialog, errText, useToast } from "./ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SettingsPage() {
  const { boot } = useScope();
  const toast = useToast();
  const [local, setLocal] = useState<Partial<Preferences>>({});
  const p: Preferences = { ...boot.prefs, ...local };
  const setP = (next: Preferences) => setLocal(next);
  const save = useAct((patch: Partial<Preferences>) => api<{ prefs: Preferences }>("/settings", { method: "PATCH", json: patch }), { onSuccess: () => toast({ text: "Saved.", tone: "ok" }) });
  const put = (patch: Partial<Preferences>) => {
    setLocal((x) => ({ ...x, ...patch }));
    save.mutate(patch, { onError: (e) => toast({ text: errText(e), tone: "error" }) });
  };
  const { theme, setTheme } = useTheme();

  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Settings</h1>
          <button className="ip-btn ml-auto" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle dark mode">{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />} {theme === "dark" ? "Light" : "Dark"}</button>
        </div>

        <Section id="privacy" title="Privacy & AI">
          <Toggle checked={p.ai_external} onChange={(v) => put({ ai_external: v })} label="Allow AI processing with an external provider" hint="Off: InboxPilot still classifies, tracks follow-ups and builds briefings with on-server rules. On: uncertain messages, summaries, drafts and the assistant may be sent to the AI provider below. Providers' API terms say API data isn't used to train their models; InboxPilot never trains shared models on your mail." />
          <Row label="What the AI may read (default)">
            <select className="ip-select" value={p.ai_content} onChange={(e) => put({ ai_content: e.target.value as Preferences["ai_content"] })}>
              <option value="metadata">Headers only: sender, subject, date (metadata-first)</option>
              <option value="snippet">Headers + Gmail&apos;s short preview</option>
              <option value="full">Full message text (trimmed, quoted replies removed)</option>
            </select>
          </Row>
          <Row label="AI provider">
            <select className="ip-select" value={p.ai_provider} onChange={(e) => put({ ai_provider: e.target.value as "anthropic" })}>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (if configured on the server)</option>
            </select>
          </Row>
          <p className="ip-muted text-[12px]">Server status: {boot.server.ai.available ? `AI available (${boot.server.ai.provider})` : boot.server.ai.reason}{boot.server.simulatedAi ? " · Simulated AI (development only)" : ""}</p>
          <Row label="Monthly AI request limit"><input type="number" className="ip-input !w-32" value={p.ai_monthly_request_cap} onChange={(e) => setP({ ...p, ai_monthly_request_cap: Number(e.target.value) })} onBlur={() => put({ ai_monthly_request_cap: p.ai_monthly_request_cap })} /></Row>
          <Toggle checked={p.ai_drafts} onChange={(v) => put({ ai_drafts: v })} label="AI reply drafting" hint="AI only writes drafts. Sending always needs you to review and press Send." />
          <Toggle checked={p.learn_from_sent} onChange={(v) => put({ learn_from_sent: v })} label="Learn my style from sent mail" hint="When drafting, include up to 3 of your recent sent emails (stored copies only) as style examples. Off by default." />
        </Section>

        <Section id="retention" title="Data retention">
          <Row label="Keep message text for">
            <select className="ip-select" value={p.body_retention_days} onChange={(e) => put({ body_retention_days: Number(e.target.value) })}>
              <option value={0}>Don&apos;t store message text (fetch when opened)</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </Row>
          <p className="ip-muted text-[12px]">Headers and Gmail&apos;s preview are kept so the inbox works; full text is deleted after this period. “Don&apos;t store” plus “Headers only” above is metadata-first mode: InboxPilot then syncs headers only.</p>
        </Section>

        <Section id="automation" title="Automation mode">
          {([
            ["observe", "Observe only (recommended to start)", "Classify and recommend. Your mailbox is never changed."],
            ["assisted", "Assisted", "Rules suggest mailbox changes (archive, label, mark read); nothing happens until you approve each one."],
            ["automatic", "Automatic", "Rules you've confirmed apply reversible mailbox changes on their own. Never deletes; every action can be undone from Rules → Action history."],
          ] as const).map(([k, l, d]) => (
            <label key={k} className="flex gap-3 rounded-xl border p-3 ip-line" style={p.automation_mode === k ? { borderColor: "var(--ip-accent)", background: "var(--ip-accent-soft)" } : undefined}>
              <input type="radio" name="mode" checked={p.automation_mode === k} onChange={() => (k !== "automatic" || confirm("Automatic mode lets confirmed rules archive, label or mark mail read in your mailbox on their own (reversible). Continue?")) && put({ automation_mode: k })} />
              <span><span className="font-medium">{l}</span><span className="ip-muted block text-[12.5px]">{d}</span></span>
            </label>
          ))}
          <Row label="Remind me about unanswered requests after"><span className="flex items-center gap-2"><input type="number" min={1} max={60} className="ip-input !w-20" value={p.followup_days} onChange={(e) => setP({ ...p, followup_days: Number(e.target.value) })} onBlur={() => put({ followup_days: p.followup_days })} /> business days</span></Row>
        </Section>

        <Section id="briefing" title="Daily briefing">
          <Row label="Time zone"><input className="ip-input" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })} onBlur={() => put({ timezone: p.timezone })} /></Row>
          {(["morning", "midday", "evening"] as const).map((k) => (
            <Row key={k} label={`${k[0].toUpperCase()}${k.slice(1)} briefing`}>
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={!!p.briefing[k]} onChange={(e) => put({ briefing: { ...p.briefing, [k]: e.target.checked ? (k === "morning" ? "08:00" : k === "midday" ? "12:30" : "17:30") : null } })} aria-label={`Enable ${k}`} />
                <input type="time" className="ip-input !w-32" disabled={!p.briefing[k]} value={p.briefing[k] ?? ""} onChange={(e) => put({ briefing: { ...p.briefing, [k]: e.target.value } })} />
              </span>
            </Row>
          ))}
          <Row label="Detail"><select className="ip-select" value={p.briefing.mode} onChange={(e) => put({ briefing: { ...p.briefing, mode: e.target.value as "concise" } })}><option value="concise">Concise</option><option value="expanded">Expanded</option></select></Row>
          <p className="ip-muted text-[12px]">Delivery: in the app (Home and Daily Brief). Email and push delivery aren&apos;t implemented yet.</p>
        </Section>

        <Section id="focus" title="Focus mode">
          <Toggle checked={p.focus.enabled} onChange={(v) => put({ focus: { ...p.focus, enabled: v } })} label="Protect focus hours" hint="During these hours InboxPilot only highlights VIP or critical mail. Your email provider keeps delivering normally." />
          {(p.focus.windows.length ? p.focus.windows : [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "12:00" }]).map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              {DAYS.map((d, di) => (
                <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={w.days.includes(di)} onChange={(e) => { const ws = [...(p.focus.windows.length ? p.focus.windows : [w])]; ws[i] = { ...w, days: e.target.checked ? [...w.days, di] : w.days.filter((x) => x !== di) }; put({ focus: { ...p.focus, windows: ws } }); }} />{d}</label>
              ))}
              <input type="time" className="ip-input !w-28" value={w.start} onChange={(e) => { const ws = [...(p.focus.windows.length ? p.focus.windows : [w])]; ws[i] = { ...w, start: e.target.value }; put({ focus: { ...p.focus, windows: ws } }); }} aria-label="Start" />
              –
              <input type="time" className="ip-input !w-28" value={w.end} onChange={(e) => { const ws = [...(p.focus.windows.length ? p.focus.windows : [w])]; ws[i] = { ...w, end: e.target.value }; put({ focus: { ...p.focus, windows: ws } }); }} aria-label="End" />
            </div>
          ))}
          <Toggle checked={p.focus.allow_vip} onChange={(v) => put({ focus: { ...p.focus, allow_vip: v } })} label="Let VIPs through" />
          <Toggle checked={p.focus.allow_critical} onChange={(v) => put({ focus: { ...p.focus, allow_critical: v } })} label="Let critical mail through" />
        </Section>

        <Section id="writing" title="Writing profile">
          <div className="grid gap-2 md:grid-cols-2">
            {(["tone", "greeting", "closing"] as const).map((k) => (
              <Row key={k} label={k[0].toUpperCase() + k.slice(1)}><input className="ip-input" value={p.writing_profile[k] ?? ""} placeholder={k === "tone" ? "warm, confident" : k === "greeting" ? "Hi {name}," : "Best,"} onChange={(e) => setP({ ...p, writing_profile: { ...p.writing_profile, [k]: e.target.value } })} onBlur={() => put({ writing_profile: p.writing_profile })} /></Row>
            ))}
            <Row label="Formality"><select className="ip-select" value={p.writing_profile.formality ?? "neutral"} onChange={(e) => put({ writing_profile: { ...p.writing_profile, formality: e.target.value as "neutral" } })}><option value="casual">Casual</option><option value="neutral">Neutral</option><option value="formal">Formal</option></select></Row>
            <Row label="Length"><select className="ip-select" value={p.writing_profile.conciseness ?? "balanced"} onChange={(e) => put({ writing_profile: { ...p.writing_profile, conciseness: e.target.value as "balanced" } })}><option value="brief">Brief</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></Row>
            <Row label="Default language"><select className="ip-select" value={p.writing_profile.language ?? "en"} onChange={(e) => put({ writing_profile: { ...p.writing_profile, language: e.target.value } })}><option value="en">English</option><option value="es">Español</option></select></Row>
          </div>
          <Row label="Signature"><textarea className="ip-textarea !min-h-[60px]" value={p.writing_profile.signature ?? ""} onChange={(e) => setP({ ...p, writing_profile: { ...p.writing_profile, signature: e.target.value } })} onBlur={() => put({ writing_profile: p.writing_profile })} /></Row>
          <Row label="Standing instructions"><textarea className="ip-textarea !min-h-[60px]" placeholder="e.g. Never commit to dates without checking with me." value={p.writing_profile.instructions ?? ""} onChange={(e) => setP({ ...p, writing_profile: { ...p.writing_profile, instructions: e.target.value } })} onBlur={() => put({ writing_profile: p.writing_profile })} /></Row>
        </Section>

        <Categories />
        <Plans />
        <DataControls />
        <p className="ip-muted text-center text-[12px]"><Link href="/inbox/ops" className="underline">Operations dashboard</Link> · <Link href="/inbox/onboarding" className="underline">Run setup again</Link></p>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="ip-card space-y-3 p-4 md:p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13px]">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}
function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex gap-3 text-[13px]">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="font-medium">{label}</span>{hint && <span className="ip-muted block text-[12.5px]">{hint}</span>}</span>
    </label>
  );
}

function Categories() {
  const { boot, ws } = useScope();
  const toast = useToast();
  const wsId = ws !== "all" ? ws : boot.workspaces[0]?.id;
  const [name, setName] = useState("");
  const add = useAct(() => api("/categories", { method: "POST", json: { ws: wsId, name } }), { onSuccess: () => setName("") });
  const upd = useAct((b: Record<string, unknown>) => api("/categories", { method: "PATCH", json: b }));
  const del = useAct((id: string) => api("/categories", { method: "DELETE", json: { id } }));
  const cats = boot.categories.filter((c) => c.workspace_id === wsId);
  if (!wsId) return null;
  return (
    <Section id="categories" title={`Categories · ${boot.workspaces.find((w) => w.id === wsId)?.name}`}>
      <p className="ip-muted text-[12.5px]">Virtual folders inside InboxPilot. Your Gmail labels and filters are left as they are.</p>
      <ul className="space-y-1.5">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-[13px]">
            <input className="ip-input !h-8 flex-1" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && upd.mutate({ id: c.id, name: e.target.value })} aria-label={`Rename ${c.name}`} />
            <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={c.hidden} onChange={(e) => upd.mutate({ id: c.id, hidden: e.target.checked })} /> Hide</label>
            {!c.system && <button className="ip-btn ip-btn-sm ip-btn-ghost" onClick={() => confirm(`Delete “${c.name}”? Its messages move to Read Later.`) && del.mutate(c.id)} aria-label="Delete"><Trash2 size={13} /></button>}
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate(undefined, { onError: (err) => toast({ text: errText(err), tone: "error" }) }); }}>
        <input className="ip-input" placeholder="New category (e.g. Clients)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="ip-btn" disabled={!name.trim()}>Add</button>
      </form>
    </Section>
  );
}

function Plans() {
  const { boot } = useScope();
  return (
    <Section id="plan" title="Plan">
      <ul className="space-y-1 text-[13px]">
        {boot.workspaces.map((w) => (
          <li key={w.id}>{w.name}: <b>{boot.entitlements[w.id]?.label}</b> · up to {boot.entitlements[w.id]?.maxAccounts} accounts</li>
        ))}
      </ul>
      <p className="ip-muted text-[12px]">
        {boot.server.billing ? "Billing is configured." : "Subscriptions aren't implemented yet: no checkout exists and nobody is charged. This owner deployment runs with every feature enabled (development plan). Plans and limits are configuration, not hard-coded prices."}
      </p>
    </Section>
  );
}

function DataControls() {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const del = useAct(() => api("/data", { method: "DELETE", json: { confirm: text } }), { onSuccess: () => { toast({ text: "All InboxPilot data deleted.", tone: "ok" }); router.push("/inbox/onboarding"); } });
  return (
    <Section id="data" title="Your data">
      <div className="flex flex-wrap gap-2">
        <a className="ip-btn" href="/api/inbox/data"><Download size={14} /> Export everything (JSON)</a>
        <button className="ip-btn ip-btn-danger" onClick={() => setOpen(true)}><Trash2 size={14} /> Delete all InboxPilot data</button>
      </div>
      <p className="ip-muted text-[12px]">Export includes messages InboxPilot stored, classifications, rules, tasks, follow-ups, drafts, audit log and AI usage. Tokens are never exported.</p>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete all InboxPilot data">
        <form className="space-y-3 text-[13px]" onSubmit={(e) => { e.preventDefault(); del.mutate(undefined, { onError: (err) => toast({ text: errText(err), tone: "error" }) }); }}>
          <p>This revokes InboxPilot&apos;s access to every connected mailbox and permanently deletes all workspaces, stored messages, rules, tasks, follow-ups, briefings, drafts and settings. Your actual mailboxes aren&apos;t touched. Write.ai and The Daily Canvas aren&apos;t affected.</p>
          <input className="ip-input" placeholder="Type DELETE" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-2"><button type="button" className="ip-btn" onClick={() => setOpen(false)}>Cancel</button><button className="ip-btn ip-btn-danger" disabled={text !== "DELETE"}>Delete permanently</button></div>
        </form>
      </Dialog>
    </Section>
  );
}
