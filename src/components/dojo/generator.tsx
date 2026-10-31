"use client";

import { AlertTriangle, ArrowRight, BookmarkPlus, ChevronDown, FlaskConical, Gauge, HelpCircle, Keyboard, Lightbulb, Minus, Plus, RotateCw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClarifyResult, GenerationResult, TemplateResult } from "@/lib/dojo/schema";
import { ALTERNATIVE_KINDS } from "@/lib/dojo/schema";
import type { TargetSpec } from "@/lib/dojo/targets";
import { targetName } from "@/lib/dojo/targets";
import { extractVariables } from "@/lib/dojo/variables";
import { api, ApiError, formatCost, modKey, readLocal, setHandoff, takeHandoff, writeLocal, type GenerationRecord, type PromptRecord, type ServedBy } from "./client";
import { PromptEditor, TargetPicker } from "./editor";
import { useDojo } from "./provider";
import { RefinePanel, type RefineOutcome } from "./refine-panel";
import { SaveTemplateDialog, SaveToLibraryDialog, type SaveDraft } from "./save-dialog";
import { Collapsible, CopyButton, Dialog, ErrorBox, Notice, ProviderBadge, Spinner } from "./ui";
import { VersionList, type VersionItem } from "./versions";
import { VoiceInput } from "./voice";

type TabKey = "recommended" | (typeof ALTERNATIVE_KINDS)[number];
const TABS: { key: TabKey; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "concise", label: "Concise" },
  { key: "comprehensive", label: "Comprehensive" },
  { key: "creative", label: "Creative / Strategic" },
];

type WorkVersion = VersionItem & { instruction: string; servedBy?: ServedBy; changes?: { what: string; why: string }[]; intentNote?: string; intentPreserved?: boolean };
type Track = { versions: WorkVersion[]; cursor: number; working: string | null; savedId: string | null; target: TargetSpec };

type Session = {
  generation: GenerationRecord;
  servedBy: ServedBy | null;
  injectionWarning: boolean;
  tab: TabKey;
  tracks: Record<TabKey, Track>;
};

type Options = { tone: string; audience: string; format: string; length: "" | "short" | "medium" | "long"; language: string };
const NO_OPTIONS: Options = { tone: "", audience: "", format: "", length: "", language: "" };

const EXAMPLES = [
  "Create a marketing campaign for my construction business.",
  "Write follow-up emails to homeowners who got a roofing quote but went quiet.",
  "Plan a nonfiction chapter about building better habits.",
  "Review my Next.js API route for security problems.",
  "Summarize the research on four-day work weeks for a skeptical CFO.",
];

const STAGES = ["Reading your request…", "Separating facts from assumptions…", "Choosing a structure for your target model…", "Writing the recommended prompt…", "Writing three alternatives…", "Explaining the design…"];

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

function tracksFrom(g: GenerationRecord, servedBy: ServedBy | null): Record<TabKey, Track> {
  const target: TargetSpec = { id: g.target_model, customName: g.custom_target || undefined };
  const mk = (content: string, label: string): Track => ({
    versions: [{ id: uid(), content, label, kind: "generated", instruction: "", createdAt: g.created_at, servedBy: servedBy ?? undefined, model: g.model }],
    cursor: 0,
    working: null,
    savedId: null,
    target,
  });
  const r = g.result;
  const alt = (k: TabKey) => r.alternatives.find((a) => a.kind === k)!;
  return {
    recommended: mk(r.recommended.prompt, "Generated"),
    concise: mk(alt("concise").prompt, "Generated"),
    comprehensive: mk(alt("comprehensive").prompt, "Generated"),
    creative: mk(alt("creative").prompt, "Generated"),
  };
}

export function Generator() {
  const router = useRouter();
  const { prefs, profiles, status, savePrefs, toast, ready } = useDojo();

  // ---- Input state (autosaved locally so nothing typed is ever lost) ---------------------
  const [request, setRequest] = useState("");
  const [target, setTarget] = useState<TargetSpec>({ id: "universal" });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>(NO_OPTIONS);
  const [advanced, setAdvanced] = useState(false);
  const [askFirst, setAskFirst] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // ---- Run state ---------------------------------------------------------------------------
  const [phase, setPhase] = useState<"idle" | "clarify" | "loading" | "done">("idle");
  const [stage, setStage] = useState(0);
  const [questions, setQuestions] = useState<ClarifyResult["questions"]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [missingAnswers, setMissingAnswers] = useState<Record<number, string>>({});
  const [saveDraft, setSaveDraft] = useState<SaveDraft | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateResult | null>(null);
  const [lastChange, setLastChange] = useState<WorkVersion | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  const [shortcuts, setShortcuts] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // Latest session for async handlers (state updaters run lazily, so read from here).
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Restore draft + last session; apply hand-offs from other pages.
  useEffect(() => {
    const draft = readLocal<{ request: string; target: TargetSpec; options: Options; profileId: string | null } | null>("pd-draft", null);
    const saved = readLocal<Session | null>("pd-session", null);
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after hydration
      setRequest(draft.request ?? "");
      if (draft.target) setTarget(draft.target);
      setOptions({ ...NO_OPTIONS, ...draft.options });
      setProfileId(draft.profileId ?? null);
    }
    if (saved?.generation?.result) {
      setSession(saved);
      setPhase("done");
    }
    setOnboarded(readLocal("pd-onboarded", false));
    const h = takeHandoff("generator");
    if (h?.request) {
      setRequest(h.request);
      setSession(null);
      setPhase("idle");
    }
    if (h?.generationId) {
      api<{ generation: GenerationRecord }>(`/api/dojo/history/${h.generationId}`)
        .then(({ generation }) => {
          const s: Session = { generation, servedBy: null, injectionWarning: false, tab: "recommended", tracks: tracksFrom(generation, null) };
          setSession(s);
          setRequest(generation.request);
          setTarget({ id: generation.target_model, customName: generation.custom_target || undefined });
          setPhase("done");
        })
        .catch((e) => setError({ message: (e as Error).message, retryable: false }));
    }
    setHydrated(true);
  }, []);

  // Defaults from settings, once they load (only if there's no draft of your own).
  const appliedDefaults = useRef(false);
  useEffect(() => {
    if (!ready || !hydrated || appliedDefaults.current) return;
    appliedDefaults.current = true;
    setAskFirst(prefs.clarify);
    if (!readLocal("pd-draft", null)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after hydration
      setTarget({ id: prefs.default_target, customName: prefs.custom_target_name || undefined, customNotes: prefs.custom_target_notes || undefined });
      setProfileId(prefs.active_profile_id);
    }
  }, [ready, hydrated, prefs]);

  useEffect(() => {
    if (hydrated) writeLocal("pd-draft", { request, target, options, profileId });
  }, [hydrated, request, target, options, profileId]);
  useEffect(() => {
    if (hydrated) writeLocal("pd-session", session);
  }, [hydrated, session]);

  // Cycle loading messages.
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    return () => clearInterval(t);
  }, [phase]);

  // ---- Generate ----------------------------------------------------------------------------
  const run = useCallback(
    async (opts: { skipClarify?: boolean; withAnswers?: { question: string; answer: string }[] } = {}) => {
      if (!request.trim()) {
        inputRef.current?.focus();
        return;
      }
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setError(null);
      setStage(0);
      setPhase("loading");
      const cleanOptions = Object.fromEntries(Object.entries(options).filter(([, v]) => v));
      try {
        const r = await api<
          | { stage: "clarify"; reason: string; questions: ClarifyResult["questions"] }
          | { stage: "done"; generation: GenerationRecord; servedBy: ServedBy; injectionWarning: boolean }
        >("/api/dojo/generate", {
          body: { request, target, profileId, options: cleanOptions, answers: opts.withAnswers ?? [], skipClarify: opts.skipClarify || !askFirst },
          signal: ac.signal,
        });
        if (r.stage === "clarify") {
          setQuestions(r.questions);
          setAnswers({});
          setPhase("clarify");
          return;
        }
        setSession({ generation: r.generation, servedBy: r.servedBy, injectionWarning: r.injectionWarning, tab: "recommended", tracks: tracksFrom(r.generation, r.servedBy) });
        setMissingAnswers({});
        setLastChange(null);
        setPhase("done");
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError({ message: (e as Error).message, retryable: e instanceof ApiError ? e.retryable : true });
        setPhase(session ? "done" : "idle");
      }
    },
    [request, target, profileId, options, askFirst, session],
  );

  const cancel = () => {
    abort.current?.abort();
    setPhase(session ? "done" : "idle");
  };

  // ---- Track helpers --------------------------------------------------------------------------
  const tab = session?.tab ?? "recommended";
  const track = session?.tracks[tab];
  const current = track ? track.versions[track.cursor] : null;
  const text = track ? (track.working ?? current?.content ?? "") : "";
  const dirty = !!track && track.working !== null && track.working !== current?.content;

  const updateTrack = useCallback((key: TabKey, fn: (t: Track) => Track) => {
    setSession((s) => (s ? { ...s, tracks: { ...s.tracks, [key]: fn(s.tracks[key]) } } : s));
  }, []);

  /**
   * Appends a version (immutable history). If this prompt is saved in the library, the
   * version is stored there first, so what you see is already persisted.
   */
  const appendVersion = useCallback(
    async (key: TabKey, v: Omit<WorkVersion, "id" | "createdAt">, newTarget?: TargetSpec) => {
      const version: WorkVersion = { ...v, id: uid(), createdAt: new Date().toISOString() };
      const savedId = sessionRef.current?.tracks[key].savedId ?? null;
      if (savedId) {
        try {
          await api(`/api/dojo/prompts/${savedId}/versions`, { body: { content: version.content, kind: version.kind, instruction: version.instruction, provider: version.servedBy?.provider ?? null, model: version.servedBy?.model ?? null } });
        } catch (e) {
          toast(`Kept here, but couldn't add it to your library: ${(e as Error).message}`, "error");
        }
      }
      setSession((s) => {
        if (!s) return s;
        const t = s.tracks[key];
        const versions = [...t.versions, version];
        return { ...s, tracks: { ...s.tracks, [key]: { ...t, versions, cursor: versions.length - 1, working: null, target: newTarget ?? t.target } } };
      });
      return version;
    },
    [toast],
  );

  const commitEdit = useCallback(async () => {
    if (!session || !track || !dirty) return;
    await appendVersion(tab, { content: track.working!, label: "Edited", kind: "edited", instruction: "" });
    toast("Kept your edit as a new version", "ok");
  }, [session, track, dirty, tab, appendVersion, toast]);

  async function onRefined(r: RefineOutcome) {
    if (!session) return;
    if (dirty && track) await appendVersion(tab, { content: track.working!, label: "Edited", kind: "edited", instruction: "" });
    const v = await appendVersion(tab, { content: r.content, label: r.label, kind: r.kind, instruction: r.instruction, summary: r.summary, servedBy: r.servedBy, changes: r.changes, intentNote: r.intentNote, intentPreserved: r.intentPreserved, model: r.servedBy.model }, r.newTarget);
    setLastChange(v);
  }

  function openSave() {
    if (!session || !track) return;
    const versions = track.versions.map((v) => ({ content: v.content, kind: v.kind as never, instruction: v.instruction, provider: v.servedBy?.provider ?? null, model: v.servedBy?.model ?? null }));
    if (dirty) versions.push({ content: track.working!, kind: "edited" as never, instruction: "", provider: null, model: null });
    const r = session.generation.result;
    const title = tab === "recommended" ? r.recommended.title : r.alternatives.find((a) => a.kind === tab)?.title ?? r.recommended.title;
    setSaveDraft({ title, target_model: track.target.id, custom_target: track.target.customName, source: tab === "recommended" ? "generated" : "alternative", generation_id: session.generation.id, versions });
  }

  function onSaved(p: PromptRecord) {
    updateTrack(tab, (t) => (dirty ? { ...t, savedId: p.id, versions: [...t.versions, { id: uid(), content: t.working!, label: "Edited", kind: "edited", instruction: "", createdAt: new Date().toISOString() }], cursor: t.versions.length, working: null } : { ...t, savedId: p.id }));
  }

  // ---- Keyboard shortcuts -------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if (mod && e.shiftKey && e.key.toLowerCase() === "c" && text) {
        e.preventDefault();
        void navigator.clipboard?.writeText(text).then(() => toast("Copied to clipboard", "ok"));
      } else if (mod && e.key.toLowerCase() === "s" && session) {
        e.preventDefault();
        openSave();
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (!typing && e.key === "?") {
        setShortcuts(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const r: GenerationResult | null = session?.generation.result ?? null;
  const activeAlt = r && tab !== "recommended" ? r.alternatives.find((a) => a.kind === tab) : null;
  const vars = useMemo(() => extractVariables(text), [text]);
  const notConfigured = status && !status.active;
  const loading = phase === "loading";

  const sizeIdx = ["sm", "md", "lg"].indexOf(prefs.text_size);

  return (
    <div className="space-y-6">
      {/* ---- Request ---------------------------------------------------------------------- */}
      <section aria-labelledby="pd-ask" className="pd-card p-4 sm:p-6">
        <h1 id="pd-ask" className="pd-serif mb-3 text-[1.6rem] leading-tight font-semibold sm:text-[2rem]">
          What would you like AI to help you accomplish?
        </h1>
        <label htmlFor="pd-request" className="sr-only">
          Describe your task
        </label>
        <textarea
          id="pd-request"
          ref={inputRef}
          className="pd-textarea min-h-32 text-[1.0625rem]"
          placeholder="e.g. “Create a marketing campaign for my construction business.” Include what you do, who it's for and the outcome you want — or just start typing."
          value={request}
          maxLength={8000}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          aria-describedby="pd-request-hint"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <VoiceInput onInsert={(t) => setRequest((r) => (r.trim() ? `${r.trimEnd()} ${t}` : t))} />
          <span id="pd-request-hint" className="text-xs pd-muted">
            {request.length > 7000 ? `${8000 - request.length} characters left · ` : ""}
            {modKey()}+Enter to generate · draft saved on this device
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <TargetPicker value={target} onChange={setTarget} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="pd-btn pd-btn-ghost pd-btn-sm" aria-expanded={advanced} aria-controls="pd-advanced" onClick={() => setAdvanced((a) => !a)}>
              Options <ChevronDown size={14} className={advanced ? "rotate-180" : ""} aria-hidden />
            </button>
            {loading ? (
              <button type="button" className="pd-btn" onClick={cancel}>
                Cancel
              </button>
            ) : null}
            <button type="button" className="pd-btn pd-btn-primary min-w-36" onClick={() => run()} disabled={loading || !request.trim() || !!notConfigured} title={notConfigured ? "Connect an AI provider first" : undefined}>
              {loading ? <Spinner size={15} label="Generating…" /> : <><Sparkles size={16} aria-hidden /> Generate</>}
            </button>
          </div>
        </div>

        <div id="pd-advanced" hidden={!advanced} className="mt-4 grid gap-3 border-t pt-4 pd-line sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Profile</span>
            <select className="pd-select" value={profileId ?? ""} onChange={(e) => setProfileId(e.target.value || null)}>
              <option value="">No profile</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {(["tone", "audience", "format", "language"] as const).map((k) => (
            <label key={k} className="space-y-1 text-sm">
              <span className="font-medium">{k === "format" ? "Output format" : k[0].toUpperCase() + k.slice(1)}</span>
              <input className="pd-input" value={options[k]} maxLength={300} onChange={(e) => setOptions({ ...options, [k]: e.target.value })} placeholder={{ tone: "e.g. friendly but authoritative", audience: "e.g. California homeowners", format: "e.g. a detailed table", language: "e.g. Spanish" }[k]} />
            </label>
          ))}
          <label className="space-y-1 text-sm">
            <span className="font-medium">Prompt length</span>
            <select className="pd-select" value={options.length} onChange={(e) => setOptions({ ...options, length: e.target.value as Options["length"] })}>
              <option value="">Automatic</option>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" checked={askFirst} onChange={(e) => setAskFirst(e.target.checked)} className="size-4 accent-[var(--pd-accent)]" />
            Ask up to three clarifying questions when something essential is missing
          </label>
          <p className="text-xs pd-muted sm:col-span-2 lg:col-span-3">
            Options and profile fill gaps; anything you wrote in the request itself takes priority.{" "}
            {status?.active && (
              <>
                Generating with <strong>{status.active.label}</strong> (<span className="pd-mono">{status.active.model}</span>) — change in Settings. The target model above only shapes the prompt.
              </>
            )}
          </p>
        </div>
      </section>

      {/* ---- Onboarding + examples ------------------------------------------------------------ */}
      {!session && phase === "idle" && (
        <section aria-label="Getting started" className="space-y-4">
          {!onboarded && (
            <div className="pd-card pd-fade-in relative p-5">
              <button type="button" className="pd-btn pd-btn-ghost pd-btn-icon pd-btn-sm absolute top-3 right-3" aria-label="Dismiss introduction" onClick={() => { setOnboarded(true); writeLocal("pd-onboarded", true); }}>
                <X size={16} />
              </button>
              <p className="pd-eyebrow mb-2">Welcome to PromptDojo</p>
              <ol className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Describe it", "Write what you want in plain words. No prompt-engineering knowledge needed."],
                  ["Get four prompts", "A recommended prompt plus concise, comprehensive and creative alternatives — with why they work."],
                  ["Refine & keep", "One-click refinements, version history, and a library that remembers everything."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold pd-accent-bg">{i + 1}</span>
                    <span>
                      <span className="block font-semibold">{t}</span>
                      <span className="text-sm pd-soft">{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div>
            <p className="pd-eyebrow mb-2">Try an example</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="pd-chip text-left" onClick={() => { setRequest(ex); inputRef.current?.focus(); }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {error && <ErrorBox message={`${error.message} Your request is still here.`} onRetry={error.retryable ? () => run() : undefined} onDismiss={() => setError(null)} />}

      {/* ---- Clarifying questions ------------------------------------------------------------- */}
      {phase === "clarify" && (
        <section className="pd-card pd-fade-in space-y-4 p-5" aria-labelledby="pd-clarify-title">
          <div className="flex items-start gap-2">
            <HelpCircle size={19} className="mt-0.5 pd-accent-text" aria-hidden />
            <div>
              <h2 id="pd-clarify-title" className="font-semibold">
                A few quick questions
              </h2>
              <p className="text-sm pd-soft">Answer any that matter — or generate now and PromptDojo will label its assumptions.</p>
            </div>
          </div>
          {questions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <label htmlFor={`pd-q-${q.id}`} className="block text-sm font-medium">
                {q.question}
              </label>
              <p className="text-xs pd-muted">{q.why_it_matters}</p>
              <div className="flex flex-wrap gap-1.5">
                {q.suggested_answers.map((s) => (
                  <button key={s} type="button" className="pd-chip" aria-pressed={answers[q.id] === s} onClick={() => setAnswers({ ...answers, [q.id]: s })}>
                    {s}
                  </button>
                ))}
              </div>
              <input id={`pd-q-${q.id}`} className="pd-input" value={answers[q.id] ?? ""} maxLength={1000} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Your answer (optional)" />
            </div>
          ))}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="pd-btn" onClick={() => run({ skipClarify: true })}>
              Generate now with assumptions
            </button>
            <button type="button" className="pd-btn pd-btn-primary" onClick={() => run({ skipClarify: true, withAnswers: questions.map((q) => ({ question: q.question, answer: answers[q.id] ?? "" })).filter((a) => a.answer.trim()) })}>
              Continue <ArrowRight size={15} aria-hidden />
            </button>
          </div>
        </section>
      )}

      {/* ---- Loading -------------------------------------------------------------------------- */}
      {loading && (
        <section className="pd-card space-y-4 p-5" aria-live="polite" aria-busy="true">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Spinner size={16} /> {STAGES[stage]}
          </p>
          <div className="space-y-2.5">
            <div className="pd-skeleton h-5 w-2/5" />
            <div className="pd-skeleton h-4 w-full" />
            <div className="pd-skeleton h-4 w-11/12" />
            <div className="pd-skeleton h-4 w-4/5" />
            <div className="pd-skeleton h-4 w-3/5" />
          </div>
          <p className="text-xs pd-muted">Thorough prompts can take up to a minute with the most capable models.</p>
        </section>
      )}

      {/* ---- Results -------------------------------------------------------------------------- */}
      {session && r && track && current && (
        <div ref={resultsRef} className="grid scroll-mt-20 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-5">
            {session.injectionWarning && (
              <Notice tone="warn" icon={<AlertTriangle size={16} />}>
                Your request contains text that looks like instructions aimed at the AI system (for example “ignore previous instructions”). PromptDojo treated it as part of your task, not as a command.
              </Notice>
            )}
            <section className="pd-card overflow-hidden" aria-label="Generated prompts">
              <div className="pd-scroll-x flex gap-1 border-b px-3 pt-3 pd-line" role="tablist" aria-label="Prompt options">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    id={`pd-tab-${t.key}`}
                    aria-selected={tab === t.key}
                    aria-controls="pd-tabpanel"
                    className="shrink-0 rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-medium transition"
                    style={{ borderColor: tab === t.key ? "var(--pd-accent)" : "transparent", color: tab === t.key ? "var(--pd-accent-ink)" : "var(--pd-ink-3)" }}
                    onClick={() => { setSession({ ...session, tab: t.key }); setLastChange(null); }}
                  >
                    {t.label}
                    {session.tracks[t.key].versions.length > 1 && <span className="ml-1.5 text-xs pd-muted">v{session.tracks[t.key].versions.length}</span>}
                  </button>
                ))}
              </div>
              <div id="pd-tabpanel" role="tabpanel" aria-labelledby={`pd-tab-${tab}`} className="space-y-3.5 p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="pd-serif text-xl font-semibold">{tab === "recommended" ? r.recommended.title : activeAlt?.title}</h2>
                    <p className="text-sm pd-soft">
                      {tab === "recommended" ? `Written for ${targetName(track.target)}${r.recommended.sections_used.length ? ` · ${r.recommended.sections_used.join(" · ")}` : ""}` : activeAlt?.approach}
                    </p>
                  </div>
                  <div className="flex items-center gap-1" role="group" aria-label="Text size">
                    <button type="button" className="pd-btn pd-btn-ghost pd-btn-icon pd-btn-sm" aria-label="Smaller text" disabled={sizeIdx <= 0} onClick={() => savePrefs({ text_size: (["sm", "md", "lg"] as const)[sizeIdx - 1] })}>
                      <Minus size={14} />
                    </button>
                    <span className="text-xs pd-muted" aria-hidden>
                      Aa
                    </span>
                    <button type="button" className="pd-btn pd-btn-ghost pd-btn-icon pd-btn-sm" aria-label="Larger text" disabled={sizeIdx >= 2} onClick={() => savePrefs({ text_size: (["sm", "md", "lg"] as const)[sizeIdx + 1] })}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {track.cursor !== track.versions.length - 1 && (
                  <Notice tone="neutral">
                    Viewing v{track.cursor + 1} of {track.versions.length}.{" "}
                    <button type="button" className="font-semibold underline" onClick={() => updateTrack(tab, (t) => ({ ...t, cursor: t.versions.length - 1, working: null }))}>
                      Back to latest
                    </button>
                  </Notice>
                )}

                <PromptEditor key={`${session.generation.id}:${tab}:${current.id}`} id="pd-editor" label="Prompt text (editable)" value={text} onChange={(v) => updateTrack(tab, (t) => ({ ...t, working: v }))} />

                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton text={text} primary />
                  <button type="button" className="pd-btn" onClick={openSave} disabled={!!track.savedId && !dirty}>
                    <BookmarkPlus size={15} aria-hidden /> {track.savedId ? (dirty ? "Save edit" : "Saved") : "Save"}
                  </button>
                  {track.savedId && dirty && (
                    <span className="sr-only">Saving an edit adds a new version to the saved prompt.</span>
                  )}
                  <button type="button" className="pd-btn" onClick={() => { setHandoff({ to: "lab", prompt: text, promptId: track.savedId ?? undefined, title: r.recommended.title }); router.push("/dojo/lab"); }}>
                    <FlaskConical size={15} aria-hidden /> Test
                  </button>
                  <button type="button" className="pd-btn" onClick={() => { setHandoff({ to: "analyzer", prompt: text }); router.push("/dojo/analyzer"); }}>
                    <Gauge size={15} aria-hidden /> Analyze
                  </button>
                  {dirty && (
                    <button type="button" className="pd-btn pd-btn-ghost" onClick={commitEdit}>
                      Keep edit as new version
                    </button>
                  )}
                  {dirty && (
                    <button type="button" className="pd-btn pd-btn-ghost" onClick={() => updateTrack(tab, (t) => ({ ...t, working: null }))}>
                      Discard edit
                    </button>
                  )}
                  <span className="ml-auto">
                    <ProviderBadge servedBy={current.servedBy ?? (session.servedBy ? session.servedBy : { providerLabel: session.generation.provider, model: session.generation.model, isMock: session.generation.is_mock })} />
                  </span>
                </div>

                {vars.length > 0 && (
                  <p className="text-xs pd-muted">
                    Fill in before use: {vars.map((v) => <code key={v} className="pd-mono mr-1.5 rounded px-1 pd-surface-2">{`{{${v}}}`}</code>)}
                  </p>
                )}
              </div>
            </section>

            {lastChange && lastChange.id === current.id && (
              <section className="pd-card pd-fade-in space-y-2 p-4" aria-live="polite">
                <p className="text-sm">
                  <strong>What changed:</strong> {lastChange.summary}
                </p>
                {lastChange.intentPreserved === false && (
                  <Notice tone="warn">Direction changed: {lastChange.intentNote}</Notice>
                )}
                {lastChange.changes && lastChange.changes.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-sm pd-soft">
                    {lastChange.changes.map((c, i) => (
                      <li key={i}>
                        {c.what} <span className="pd-muted">— {c.why}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <RefinePanel prompt={text} target={track.target} originalRequest={session.generation.request} onResult={onRefined} onTemplate={(t) => setTemplateDraft(t)} disabled={loading} />

            {tab === "recommended" && (
              <Collapsible title="Why this works" defaultOpen badge={<Lightbulb size={16} className="pd-accent-text" aria-hidden />}>
                <p className="mb-3 text-sm">{r.explanation.summary}</p>
                <dl className="space-y-2.5">
                  {r.explanation.techniques.map((t, i) => (
                    <div key={i} className="text-sm">
                      <dt className="font-semibold">{t.technique}</dt>
                      <dd className="pd-soft">{t.why}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs pd-muted">This describes the prompt&apos;s design. It isn&apos;t a guarantee of results — test it in the Lab to see how it performs.</p>
              </Collapsible>
            )}

            {r.next_steps.length > 0 && (
              <section className="pd-card p-4" aria-labelledby="pd-next">
                <h3 id="pd-next" className="mb-2.5 text-sm font-semibold">
                  Suggested next steps
                </h3>
                <ul className="space-y-2">
                  {r.next_steps.map((n, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`pd-badge ${n.kind === "refinement" ? "pd-badge-accent" : ""}`}>{n.kind === "refinement" ? "Refine" : "Follow-up"}</span>
                      <span className="min-w-0 flex-1">{n.label}</span>
                      {n.kind === "follow_up" ? (
                        <button type="button" className="pd-btn pd-btn-sm" onClick={() => { setRequest(n.instruction); setSession(null); setPhase("idle"); window.scrollTo({ top: 0, behavior: "smooth" }); inputRef.current?.focus(); }}>
                          Use as new request
                        </button>
                      ) : (
                        <RefineStep instruction={n.instruction} label={n.label} prompt={text} target={track.target} request={session.generation.request} onDone={onRefined} />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* ---- Context panel ---------------------------------------------------------------- */}
          <aside className="min-w-0 space-y-4" aria-label="Prompt notes">
            {r.missing_context.length > 0 && (
              <section className="pd-card p-4" aria-labelledby="pd-missing">
                <h3 id="pd-missing" className="mb-1 text-sm font-semibold">
                  Missing context
                </h3>
                <p className="mb-3 text-xs pd-muted">Answering these could change the result. Leave blank to skip.</p>
                <div className="space-y-3">
                  {r.missing_context.map((m, i) => (
                    <div key={i}>
                      <label htmlFor={`pd-m-${i}`} className="block text-sm">
                        {m.question}
                      </label>
                      <span className="block text-xs pd-muted">{m.why_it_matters}</span>
                      <input id={`pd-m-${i}`} className="pd-input mt-1 py-1.5 text-sm" value={missingAnswers[i] ?? ""} maxLength={1000} onChange={(e) => setMissingAnswers({ ...missingAnswers, [i]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="pd-btn pd-btn-sm mt-3 w-full"
                  disabled={loading || !Object.values(missingAnswers).some((v) => v.trim())}
                  onClick={() => run({ skipClarify: true, withAnswers: r.missing_context.map((m, i) => ({ question: m.question, answer: missingAnswers[i] ?? "" })).filter((a) => a.answer.trim()).slice(0, 3) })}
                >
                  <RotateCw size={14} aria-hidden /> Regenerate with answers
                </button>
              </section>
            )}

            {r.assumptions.length > 0 && (
              <section className="pd-card p-4" aria-labelledby="pd-assume">
                <h3 id="pd-assume" className="mb-2 text-sm font-semibold">
                  Assumptions made
                </h3>
                <ul className="space-y-2 text-sm">
                  {r.assumptions.map((a, i) => (
                    <li key={i}>
                      <span className="pd-badge mr-1.5">{a.field}</span>
                      {a.assumption}
                      <span className="block text-xs pd-muted">If wrong: {a.impact}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {r.analysis.known_facts.length > 0 && (
              <section className="pd-card p-4" aria-labelledby="pd-facts">
                <h3 id="pd-facts" className="mb-2 text-sm font-semibold">
                  What you told us
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-sm pd-soft">
                  {r.analysis.known_facts.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </section>
            )}

            <VersionList
              versions={track.versions}
              currentIndex={track.cursor}
              onSelect={(i) => updateTrack(tab, (t) => ({ ...t, cursor: i, working: null }))}
              onRestore={(i) => void appendVersion(tab, { content: track.versions[i].content, label: `Restored v${i + 1}`, kind: "restored", instruction: "" }).then(() => toast(`Restored v${i + 1} as a new version`, "ok"))}
            />

            <section className="pd-card space-y-1.5 p-4 text-xs pd-muted" aria-label="Generation details">
              <p>
                Target: <strong className="pd-soft">{targetName(track.target)}</strong>
              </p>
              <p>
                Engine: <span className="pd-mono">{session.generation.meta_prompt_version}</span> · schema <span className="pd-mono">{session.generation.schema_version}</span>
              </p>
              {session.servedBy && (
                <p>
                  Tokens: {session.servedBy.usage.inputTokens.toLocaleString()} in / {session.servedBy.usage.outputTokens.toLocaleString()} out · est. {formatCost(session.servedBy.usage.costUsd)}
                </p>
              )}
              <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost -ml-2" onClick={() => setShortcuts(true)}>
                <Keyboard size={13} aria-hidden /> Shortcuts
              </button>
            </section>
          </aside>
        </div>
      )}

      <SaveToLibraryDialog open={!!saveDraft} draft={saveDraft} onClose={() => setSaveDraft(null)} onSaved={onSaved} />
      <SaveTemplateDialog open={!!templateDraft} initial={templateDraft} onClose={() => setTemplateDraft(null)} />
      <Dialog open={shortcuts} onClose={() => setShortcuts(false)} title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {[
            [`${modKey()} + Enter`, "Generate (in the request box)"],
            [`${modKey()} + Shift + C`, "Copy the current prompt"],
            [`${modKey()} + S`, "Save to library"],
            [`${modKey()} + Z / ${modKey()} + Shift + Z`, "Undo / redo in the editor"],
            ["/", "Jump to the request box"],
            ["?", "Show this list"],
          ].map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="pd-mono rounded border px-1.5 py-0.5 text-xs pd-line">{k}</kbd>
              </dt>
              <dd className="pd-soft">{d}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}

/** A suggested refinement, applied in place. */
function RefineStep({ instruction, label, prompt, target, request, onDone }: { instruction: string; label: string; prompt: string; target: TargetSpec; request: string; onDone: (r: RefineOutcome) => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useDojo().toast;
  return (
    <button
      type="button"
      className="pd-btn pd-btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ result: { prompt: string; change_summary: string; changes: { what: string; why: string }[]; intent_preserved: boolean; intent_note: string }; servedBy: ServedBy }>("/api/dojo/refine", { body: { prompt, instruction, target, originalRequest: request, action: "suggested" } });
          onDone({ content: r.result.prompt, kind: "refined", instruction, label, summary: r.result.change_summary, changes: r.result.changes, intentNote: r.result.intent_note, intentPreserved: r.result.intent_preserved, servedBy: r.servedBy });
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner size={13} /> : "Apply"}
    </button>
  );
}
