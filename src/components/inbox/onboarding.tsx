"use client";

import { ArrowLeft, ArrowRight, Briefcase, Check, FlaskConical, Home, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Rule } from "@/lib/inbox/rules";
import { api, useBoot, type Bootstrap } from "./api";
import { Logo } from "./shell";
import { Spinner, errText, useToast } from "./ui";

const STEPS = ["Welcome", "Setup", "Connect", "Permissions", "VIPs", "Organization", "AI", "Briefing", "Analysis", "Rules", "Done"] as const;

export function OnboardingPage() {
  const boot = useBoot();
  if (!boot.data) return <div className="grid h-full place-items-center"><Spinner /></div>;
  return <Wizard d={boot.data} />;
}

function Wizard({ d }: { d: Bootstrap }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  // Resume where the person left off.
  const ob = d.prefs.onboarding as { step?: number; ws?: string };
  const [step, setStep] = useState(ob.step && ob.step < STEPS.length - 1 ? ob.step : 0);
  const [wsId, setWsId] = useState<string | null>(() => (ob.ws && d.workspaces.some((w) => w.id === ob.ws) ? ob.ws : d.workspaces.find((w) => !w.is_demo)?.id ?? d.workspaces[0]?.id ?? null));
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"personal" | "business">("business");
  const [name, setName] = useState("");
  const [vips, setVips] = useState("");
  const [style, setStyle] = useState<"minimal" | "balanced" | "detailed">("balanced");
  const [ai, setAi] = useState({ ai_external: d.prefs.ai_external, ai_content: d.prefs.ai_content });
  const [brief, setBrief] = useState(d.prefs.briefing.morning ?? "08:00");
  const [progress, setProgress] = useState<string>("");
  const [templates, setTemplates] = useState<{ rule: Omit<Rule, "id">; on: boolean; preview?: number }[]>([]);

  const go = async (n: number, extra: Record<string, unknown> = {}) => {
    setStep(n);
    await api("/settings", { method: "PATCH", json: { onboarding: { step: n, ws: wsId, ...extra } } }).catch(() => undefined);
  };
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ text: errText(e), tone: "error" });
    }
    setBusy(false);
  };
  const accounts = d?.accounts.filter((a) => a.workspace_id === wsId) ?? [];

  const body = () => {
    switch (STEPS[step]) {
      case "Welcome":
        return (
          <>
            <h1 className="text-[24px] font-bold tracking-tight">Your inbox should work for you.</h1>
            <p className="ip-muted">InboxPilot sorts what matters from what can wait, tracks who&apos;s waiting on whom, and drafts replies you approve. It starts in <b>Observe</b> mode: nothing in your mailbox changes until you say so.</p>
            <p className="ip-muted text-[13px]">Signed in as {d?.user.email}.</p>
            <Next onClick={() => go(1)} />
          </>
        );
      case "Setup":
        return (
          <>
            <h2 className="text-[19px] font-semibold">Personal or professional?</h2>
            <p className="ip-muted text-[13px]">Each workspace keeps its own accounts, rules and learning, so personal and business mail never mix. You can add more later.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {([["business", "Professional", Briefcase, "Clients, vendors, team"], ["personal", "Personal", Home, "Family, receipts, life admin"]] as const).map(([k, l, Icon, sub]) => (
                <button key={k} className="ip-card ip-hover flex items-center gap-3 p-4 text-left" style={kind === k ? { borderColor: "var(--ip-accent)" } : undefined} onClick={() => setKind(k)} aria-pressed={kind === k}>
                  <Icon size={20} style={{ color: "var(--ip-accent)" }} />
                  <span><span className="block font-semibold">{l}</span><span className="ip-muted text-[12.5px]">{sub}</span></span>
                </button>
              ))}
            </div>
            <input className="ip-input" placeholder={kind === "business" ? "Workspace name (e.g. Acme Consulting)" : "Workspace name (e.g. Personal)"} value={name} onChange={(e) => setName(e.target.value)} />
            <Nav back={() => go(0)} next={() => guard(async () => {
              if (wsId && d?.workspaces.some((w) => w.id === wsId && !w.is_demo)) return void (await go(2));
              const r = await api<{ workspace: { id: string } }>("/workspaces", { method: "POST", json: { name: name || (kind === "business" ? "Work" : "Personal"), kind } });
              setWsId(r.workspace.id);
              await qc.invalidateQueries();
              await api("/settings", { method: "PATCH", json: { onboarding: { step: 2, ws: r.workspace.id } } });
              setStep(2);
            })} busy={busy} />
          </>
        );
      case "Connect":
        return (
          <>
            <h2 className="text-[19px] font-semibold">Connect your email</h2>
            {accounts.length > 0 && <p className="ip-chip ip-chip-low"><Check size={12} /> Connected: {accounts.map((a) => a.email).join(", ")}</p>}
            {d?.server.gmail ? (
              <a className="ip-btn ip-btn-primary w-fit" href={`/api/inbox/gmail/connect?workspace=${wsId}&level=read`} onClick={() => void api("/settings", { method: "PATCH", json: { onboarding: { step: 3, ws: wsId } } })}><Mail size={15} /> Connect Gmail</a>
            ) : (
              <p className="ip-card p-3 text-[13px]" style={{ background: "var(--ip-warn-soft)", color: "var(--ip-warn)" }}>Gmail can&apos;t be connected on this server yet: {d?.server.gmailReason} (see docs/inbox/SETUP.md). You can continue with the demo mailbox.</p>
            )}
            <p className="ip-muted text-[13px]">Outlook / Microsoft 365: planned, not available yet.</p>
            <button className="ip-btn w-fit" disabled={busy} onClick={() => guard(async () => { await api("/demo", { method: "POST" }); await qc.invalidateQueries(); toast({ text: "Demo mailbox loaded in a separate Demo workspace.", tone: "ok" }); })}>
              {busy ? <Spinner size={13} /> : <FlaskConical size={14} />} Use the demo mailbox instead
            </button>
            <Nav back={() => go(1)} next={() => go(3)} />
          </>
        );
      case "Permissions":
        return (
          <>
            <h2 className="flex items-center gap-2 text-[19px] font-semibold"><ShieldCheck size={20} style={{ color: "var(--ip-teal)" }} /> What InboxPilot does with access</h2>
            <ul className="space-y-2 text-[13.5px]">
              <li>• <b>Reads</b> your mail to classify it, track conversations and build briefings. Message text is kept for 14 days by default (adjustable, or not at all).</li>
              <li>• <b>Never changes your mailbox</b> in Observe mode. Organizing (archive, labels) needs an extra permission and your approval.</li>
              <li>• <b>Never sends</b> on its own. AI writes drafts; you review recipients, subject and text and press Send.</li>
              <li>• <b>Never deletes</b> email, and doesn&apos;t touch Gmail&apos;s spam protection.</li>
              <li>• Your existing Gmail labels, filters and folders stay exactly as they are.</li>
              <li>• Disconnect any time: access is revoked and stored data deleted.</li>
            </ul>
            <Nav back={() => go(2)} next={() => go(4)} />
          </>
        );
      case "VIPs":
        return (
          <>
            <h2 className="text-[19px] font-semibold">Who always matters?</h2>
            <p className="ip-muted text-[13px]">VIPs are always prioritized and can reach you during focus hours. One email per line or separated by commas.</p>
            <textarea className="ip-textarea" placeholder={"ceo@client.com\npartner@firm.com"} value={vips} onChange={(e) => setVips(e.target.value)} />
            <Nav back={() => go(3)} next={() => guard(async () => {
              const emails = vips.split(/[\s,;]+/).filter(Boolean);
              if (emails.length && wsId) await api("/senders", { method: "POST", json: { ws: wsId, emails, is_vip: true } });
              await go(5);
            })} busy={busy} />
          </>
        );
      case "Organization":
        return (
          <>
            <h2 className="text-[19px] font-semibold">How organized do you like it?</h2>
            <p className="ip-muted text-[13px]">InboxPilot uses virtual categories on top of your inbox; it doesn&apos;t create Gmail folders.</p>
            {([["minimal", "Minimal", "Priority, Needs attention and Everything else"], ["balanced", "Balanced (recommended)", "Adds Newsletters, Notifications, Receipts, Read Later"], ["detailed", "Detailed", "All categories, including Personal and To Do"]] as const).map(([k, l, s]) => (
              <label key={k} className="flex gap-3 rounded-xl border p-3 ip-line" style={style === k ? { borderColor: "var(--ip-accent)" } : undefined}>
                <input type="radio" checked={style === k} onChange={() => setStyle(k)} />
                <span><span className="font-medium">{l}</span><span className="ip-muted block text-[12.5px]">{s}</span></span>
              </label>
            ))}
            <Nav back={() => go(4)} next={() => guard(async () => {
              const hide = style === "minimal" ? ["read_later", "newsletters", "notifications", "receipts", "personal", "todo"] : style === "balanced" ? ["personal", "todo"] : [];
              for (const c of d?.categories.filter((c) => c.workspace_id === wsId) ?? []) {
                const h = hide.includes(c.key);
                if (h !== c.hidden) await api("/categories", { method: "PATCH", json: { id: c.id, hidden: h } });
              }
              await go(6);
            })} busy={busy} />
          </>
        );
      case "AI":
        return (
          <>
            <h2 className="text-[19px] font-semibold">AI permissions</h2>
            <p className="ip-muted text-[13px]">InboxPilot works without AI (rules-based sorting, tracking and briefings). Turning AI on adds summaries, better handling of unclear messages, drafting and the assistant.</p>
            <label className="flex gap-3 text-[13.5px]"><input type="checkbox" checked={ai.ai_external} onChange={(e) => setAi({ ...ai, ai_external: e.target.checked })} /> <span>Allow AI processing with {d?.server.ai.provider ?? "the configured AI provider"}<span className="ip-muted block text-[12.5px]">Only the parts you allow below are sent, only when needed. Email content is treated as data, never as instructions.</span></span></label>
            <select className="ip-select" value={ai.ai_content} onChange={(e) => setAi({ ...ai, ai_content: e.target.value as "metadata" })} disabled={!ai.ai_external}>
              <option value="metadata">Headers only (sender, subject, date)</option>
              <option value="snippet">Headers + short preview</option>
              <option value="full">Full message text</option>
            </select>
            <Nav back={() => go(5)} next={() => guard(async () => { await api("/settings", { method: "PATCH", json: ai }); await go(7); })} busy={busy} />
          </>
        );
      case "Briefing":
        return (
          <>
            <h2 className="text-[19px] font-semibold">When do you want your daily briefing?</h2>
            <input type="time" className="ip-input !w-40" value={brief} onChange={(e) => setBrief(e.target.value)} />
            <p className="ip-muted text-[13px]">Time zone: {d?.prefs.timezone} (change in Settings). You can add midday and evening briefings later, or press “Brief me now” any time.</p>
            <Nav back={() => go(6)} next={() => guard(async () => { await api("/settings", { method: "PATCH", json: { briefing: { morning: brief } } }); await go(8); })} busy={busy} />
          </>
        );
      case "Analysis":
        return (
          <>
            <h2 className="text-[19px] font-semibold">Initial inbox analysis</h2>
            <p className="ip-muted text-[13px]">Imports the last 30 days (up to 1,000 messages) and classifies them. It runs in steps, so you can leave and come back; background sync continues where it stopped. Nothing in your mailbox changes.</p>
            {accounts.length === 0 && !d?.accounts.length ? <p className="ip-chip ip-chip-warn">No account connected yet.</p> : null}
            <button className="ip-btn ip-btn-primary w-fit" disabled={busy || !d?.accounts.length} onClick={() => guard(async () => {
              for (const a of d!.accounts) {
                for (let i = 0; i < 25; i++) {
                  const r = await api<{ result: { done: boolean; inserted: number; error?: string }; account: { sync_state: { fetched?: number; target?: number } } }>(`/accounts/${a.id}/sync`, { method: "POST" });
                  setProgress(`${a.email}: ${r.account.sync_state?.fetched ?? r.result.inserted} messages analysed${r.account.sync_state?.target ? ` of ~${r.account.sync_state.target}` : ""}`);
                  if (r.result.error) throw new Error(r.result.error);
                  if (r.result.done) break;
                }
              }
              await qc.invalidateQueries();
              setProgress((p) => `${p} · done`);
            })}>{busy ? <Spinner size={14} /> : null} Analyse my inbox</button>
            {progress && <p className="text-[13px]">{progress}</p>}
            <Nav back={() => go(7)} next={() => guard(async () => {
              const r = await api<{ templates: Omit<Rule, "id">[] }>(`/rules?ws=${wsId}`);
              const out = [];
              for (const t of r.templates) {
                const p = await api<{ matchCount: number }>("/rules/preview", { method: "POST", json: { ws: wsId, rule: t } }).catch(() => ({ matchCount: 0 }));
                out.push({ rule: t, on: true, preview: p.matchCount });
              }
              setTemplates(out);
              await go(9);
            })} busy={busy} />
          </>
        );
      case "Rules":
        return (
          <>
            <h2 className="text-[19px] font-semibold">Recommended rules</h2>
            <p className="ip-muted text-[13px]">These organize mail inside InboxPilot only. The number shows how many recent messages each would affect. Untick anything you don&apos;t want.</p>
            {templates.map((t, i) => (
              <label key={t.rule.name} className="flex items-center gap-3 rounded-xl border p-3 text-[13.5px] ip-line">
                <input type="checkbox" checked={t.on} onChange={(e) => setTemplates((ts) => ts.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                <span className="flex-1">{t.rule.name}</span>
                <span className="ip-chip">{t.preview ?? 0} recent</span>
              </label>
            ))}
            <Nav back={() => go(8)} next={() => guard(async () => {
              for (const t of templates.filter((x) => x.on)) await api("/rules", { method: "POST", json: { ws: wsId, rule: { ...t.rule, confirmed_broad: true } } }).catch(() => undefined);
              await go(10, { completed: true });
            })} busy={busy} label="Create selected rules" />
          </>
        );
      default:
        return (
          <>
            <h2 className="text-[22px] font-bold">You&apos;re set.</h2>
            <p className="ip-muted">Your dashboard shows what needs attention, who&apos;s waiting on you, and what can wait. Correct any classification and InboxPilot learns, within this workspace only.</p>
            <button className="ip-btn ip-btn-primary w-fit" onClick={() => { void qc.invalidateQueries(); router.push("/inbox"); }}>Open my dashboard <ArrowRight size={15} /></button>
          </>
        );
    }
  };

  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-8">
        <div className="flex items-center gap-2"><Logo size={26} /><span className="font-bold">InboxPilot</span><span className="ip-muted ml-auto text-[12px]">Step {step + 1} of {STEPS.length}</span></div>
        <div className="h-1 overflow-hidden rounded-full" style={{ background: "var(--ip-line)" }}><div className="h-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "var(--ip-accent)" }} /></div>
        <div className="ip-card ip-fade-in flex flex-col gap-3 p-5" key={step}>{body()}</div>
      </div>
    </div>
  );
}

function Next({ onClick }: { onClick: () => void }) {
  return <button className="ip-btn ip-btn-primary w-fit" onClick={onClick}>Get started <ArrowRight size={15} /></button>;
}
function Nav({ back, next, busy, label = "Continue" }: { back: () => void; next: () => void; busy?: boolean; label?: string }) {
  return (
    <div className="mt-2 flex justify-between">
      <button className="ip-btn" onClick={back}><ArrowLeft size={14} /> Back</button>
      <button className="ip-btn ip-btn-primary" onClick={next} disabled={busy}>{busy ? <Spinner size={14} /> : null} {label} <ArrowRight size={14} /></button>
    </div>
  );
}
