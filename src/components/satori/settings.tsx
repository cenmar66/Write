"use client";

import { Check, Download, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PRESET_PROFILES, type Profile, type ProfileInput } from "@/lib/satori/profiles";
import type { Preferences } from "@/lib/satori/store/types";
import type { TargetSpec } from "@/lib/satori/targets";
import { api, download } from "./client";
import { BudgetSettings } from "./budget-settings";
import { ConnectorsSettings } from "./connectors-settings";
import { TargetPicker } from "./editor";
import { useSatori } from "./provider";
import { Dialog, ErrorBox, Field, PageHeader, Spinner } from "./ui";

const ACCENTS: { id: Preferences["accent"]; label: string; color: string }[] = [
  { id: "teal", label: "Deep teal", color: "#0f6e66" },
  { id: "indigo", label: "Indigo", color: "#3b46b8" },
  { id: "plum", label: "Plum", color: "#86307a" },
  { id: "amber", label: "Amber", color: "#8c5200" },
  { id: "slate", label: "Slate", color: "#3f5566" },
  { id: "forest", label: "Forest", color: "#2f6b2f" },
];

const EMPTY_PROFILE: ProfileInput = { name: "", tone: "", field: "", favorite_target: "", audience: "", response_format: "", language: "", prompt_length: "", custom_instructions: "" };

function Section({ id, title, children, description }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="ps-card scroll-mt-20 space-y-4 p-4 sm:p-5" aria-labelledby={`${id ?? title}-h`}>
      <div>
        <h2 id={`${id ?? title}-h`} className="ps-serif text-xl font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm ps-soft">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { prefs, savePrefs, profiles, reloadProfiles, status, toast } = useSatori();
  const [editing, setEditing] = useState<(ProfileInput & { id?: string }) | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const defaultTarget: TargetSpec = { id: prefs.default_target, customName: prefs.custom_target_name || undefined, customNotes: prefs.custom_target_notes || undefined };
  const providers = (status?.providers ?? []).filter((p) => p.configured);

  async function saveProfile() {
    if (!editing) return;
    setBusy(true);
    setProfileError(null);
    try {
      const { id, ...body } = editing;
      await api(id ? `/api/satori/profiles/${id}` : "/api/satori/profiles", { method: id ? "PATCH" : "POST", body });
      await reloadProfiles();
      setEditing(null);
      toast("Profile saved", "ok");
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    setBusy(true);
    try {
      await api("/api/satori/account", { method: "DELETE" });
      ["ps-draft", "ps-session", "ps-prefs", "ps-analyzer-draft", "ps-lab-draft", "ps-lab-criteria", "ps-onboarded"].forEach((k) => localStorage.removeItem(k));
      toast("All PromptSatori data deleted", "ok");
      setConfirmDelete(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />

      <Section title="Appearance">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Theme">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Theme">
              {(["system", "light", "dark"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={prefs.theme === t} className="ps-chip" onClick={() => savePrefs({ theme: t })}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Accent color">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={prefs.accent === a.id} aria-label={a.label} title={a.label} className="grid size-8 place-items-center rounded-full ring-offset-2" style={{ background: a.color, boxShadow: prefs.accent === a.id ? `0 0 0 2px var(--ps-surface), 0 0 0 4px ${a.color}` : undefined }} onClick={() => savePrefs({ accent: a.id })}>
                  {prefs.accent === a.id && <Check size={15} color="#fff" aria-hidden />}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Prompt text size">
            <div className="flex gap-1.5" role="radiogroup" aria-label="Prompt text size">
              {(["sm", "md", "lg"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={prefs.text_size === s} className="ps-chip" onClick={() => savePrefs({ text_size: s })}>
                  {{ sm: "Small", md: "Medium", lg: "Large" }[s]}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Defaults" description="Used when you start a new request. You can change them per request in the generator.">
        <TargetPicker value={defaultTarget} onChange={(t) => savePrefs({ default_target: t.id, custom_target_name: t.customName ?? "", custom_target_notes: t.customNotes ?? "" })} label="Default target model" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--ps-accent)]" checked={prefs.clarify} onChange={(e) => savePrefs({ clarify: e.target.checked })} />
          Ask clarifying questions when something essential is missing
        </label>
      </Section>

      <Section id="providers" title="AI providers" description="The generation provider writes your prompts. It's separate from the target model you're writing for.">
        {status === null ? (
          <Spinner label="Checking…" />
        ) : (
          <>
            <ul className="space-y-1.5 text-sm">
              {status.providers.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className={`ps-badge ${p.configured ? (p.isMock ? "ps-badge-warn" : "ps-badge-ok") : ""}`}>{p.configured ? (p.isMock ? "test only" : "connected") : "not configured"}</span>
                  <span className="font-medium">{p.label}</span>
                  {p.configured && <span className="text-xs ps-muted">{p.models.map((m) => m.id).join(", ")}</span>}
                  {!p.configured && !!p.missing?.length && (
                    <span className="text-xs ps-muted">
                      Missing in Vercel: {p.missing.map((m) => <code key={m} className="ps-mono mr-1">{m}</code>)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {providers.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Generation provider" htmlFor="ps-gen-provider">
                  <select id="ps-gen-provider" className="ps-select" value={prefs.provider || status.active?.provider || ""} onChange={(e) => savePrefs({ provider: e.target.value, model: "" })}>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Model" htmlFor="ps-gen-model">
                  <select id="ps-gen-model" className="ps-select" value={prefs.model || status.active?.model || ""} onChange={(e) => savePrefs({ model: e.target.value })}>
                    {(providers.find((p) => p.id === (prefs.provider || status.active?.provider)) ?? providers[0]).models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : (
              <ErrorBox message="No provider is connected. Add ANTHROPIC_API_KEY (and optionally OPENAI_API_KEY + OPENAI_MODELS or GEMINI_API_KEY + GEMINI_MODELS) to the server environment, then redeploy." />
            )}
            <p className="text-xs ps-muted">API keys live only on the server and are never sent to the browser.</p>
          </>
        )}
      </Section>

      <Section id="connectors" title="Connected apps" description="Let Claude use your other apps when you run a prompt in the Testing Lab.">
        <ConnectorsSettings />
      </Section>

      <Section title="Profiles" description="Optional preferences that fill gaps in your requests. They never override what you explicitly ask for.">
        <ul className="space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 ps-line">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.name}</span>
                <span className="block truncate text-xs ps-muted">{[p.field, p.tone, p.audience].filter(Boolean).join(" · ") || "No details yet"}</span>
              </span>
              {prefs.active_profile_id === p.id ? (
                <span className="ps-badge ps-badge-accent">Default</span>
              ) : (
                <button type="button" className="ps-btn ps-btn-sm" onClick={() => savePrefs({ active_profile_id: p.id })}>
                  Make default
                </button>
              )}
              <button type="button" className="ps-btn ps-btn-sm" onClick={() => setEditing({ ...p })}>
                Edit
              </button>
              <button
                type="button"
                className="ps-btn ps-btn-sm ps-btn-ghost ps-btn-icon"
                aria-label={`Delete ${p.name}`}
                onClick={async () => {
                  if (!confirm(`Delete the profile “${p.name}”?`)) return;
                  await api(`/api/satori/profiles/${p.id}`, { method: "DELETE" }).catch((e) => toast((e as Error).message, "error"));
                  await reloadProfiles();
                  if (prefs.active_profile_id === p.id) void savePrefs({ active_profile_id: null });
                }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        {prefs.active_profile_id && (
          <button type="button" className="ps-btn ps-btn-sm ps-btn-ghost" onClick={() => savePrefs({ active_profile_id: null })}>
            Use no profile by default
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ps-btn" onClick={() => setEditing({ ...EMPTY_PROFILE })}>
            <Plus size={15} aria-hidden /> New profile
          </button>
          {PRESET_PROFILES.filter((pp) => !profiles.some((p) => p.name === pp.name)).map((pp) => (
            <button key={pp.id} type="button" className="ps-chip" onClick={() => setEditing(withoutPreset(pp))}>
              + {pp.name}
            </button>
          ))}
        </div>
      </Section>

      <Section id="budget" title="Budget & prices" description="Set a monthly AI budget, get warned before you reach it, and price models so their costs are counted.">
        <BudgetSettings />
      </Section>

      <Section title="Your data" description="Export everything, set how long history is kept, or delete it all.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ps-btn"
            onClick={async () => {
              const res = await fetch("/api/satori/export?format=json");
              if (res.ok) download(`promptsatori-${new Date().toISOString().slice(0, 10)}.json`, await res.text(), "application/json");
              else toast("Export failed", "error");
            }}
          >
            <Download size={15} aria-hidden /> Export all (JSON)
          </button>
          <Link href="/satori/library" className="ps-btn">
            Import in Library
          </Link>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Keep generation history, analyses and test runs for" htmlFor="ps-retention">
            <select id="ps-retention" className="ps-select w-auto" value={prefs.retention_days} onChange={(e) => savePrefs({ retention_days: Number(e.target.value) })}>
              <option value={0}>Forever</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>1 year</option>
            </select>
          </Field>
          {prefs.retention_days > 0 && (
            <button
              type="button"
              className="ps-btn ps-btn-sm"
              onClick={async () => {
                const r = await api<{ removed: number }>("/api/satori/account", { method: "POST", body: {} }).catch((e) => (toast((e as Error).message, "error"), null));
                if (r) toast(`Removed ${r.removed} old records`, "ok");
              }}
            >
              Apply now
            </button>
          )}
        </div>
        <p className="text-xs ps-muted">Saved library prompts are kept until you delete them. Retention also runs automatically after each generation.</p>
        <button type="button" className="ps-btn ps-btn-danger" onClick={() => { setDeleteText(""); setConfirmDelete(true); }}>
          <Trash2 size={15} aria-hidden /> Delete all PromptSatori data
        </button>
        <p className="text-xs ps-muted">
          To delete your whole Write.ai account (sign-in included), remove the user in Supabase → Authentication; all PromptSatori rows are removed with it. See <Link className="underline" href="/satori/privacy">Privacy</Link>.
        </p>
      </Section>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit profile" : "New profile"}>
        {editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveProfile();
            }}
          >
            <Field label="Name" htmlFor="pf-name">
              <input id="pf-name" className="ps-input" required maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["field", "Professional field", 200],
                  ["tone", "Preferred tone", 200],
                  ["audience", "Typical audience", 300],
                  ["response_format", "Preferred response format", 300],
                  ["language", "Default language", 60],
                ] as const
              ).map(([k, label, max]) => (
                <Field key={k} label={label} htmlFor={`pf-${k}`}>
                  <input id={`pf-${k}`} className="ps-input" maxLength={max} value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} />
                </Field>
              ))}
              <Field label="Preferred prompt length" htmlFor="pf-len">
                <select id="pf-len" className="ps-select" value={editing.prompt_length} onChange={(e) => setEditing({ ...editing, prompt_length: e.target.value as ProfileInput["prompt_length"] })}>
                  <option value="">Automatic</option>
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </Field>
            </div>
            <Field label="Custom instructions" hint="Applied to every prompt you generate with this profile." htmlFor="pf-ci">
              <textarea id="pf-ci" className="ps-textarea min-h-20" maxLength={2000} value={editing.custom_instructions} onChange={(e) => setEditing({ ...editing, custom_instructions: e.target.value })} />
            </Field>
            {profileError && <ErrorBox message={profileError} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="ps-btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="ps-btn ps-btn-primary" disabled={busy || !editing.name.trim()}>
                {busy ? <Spinner size={14} label="Saving…" /> : "Save profile"}
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete all PromptSatori data?">
        <div className="space-y-3">
          <p className="text-sm">This permanently deletes your saved prompts and versions, history, templates, test runs, analyses, profiles, settings and usage records. It can&apos;t be undone. Consider exporting first.</p>
          <Field label='Type "DELETE" to confirm' htmlFor="ps-del">
            <input id="ps-del" className="ps-input" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="ps-btn" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="ps-btn ps-btn-primary" style={{ background: "var(--ps-danger)", borderColor: "var(--ps-danger)" }} disabled={deleteText !== "DELETE" || busy} onClick={deleteAll}>
              {busy ? <Spinner size={14} /> : "Delete everything"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function withoutPreset(p: Profile): ProfileInput {
  const { id: _id, preset: _preset, ...rest } = p;
  void _id;
  void _preset;
  return rest;
}
