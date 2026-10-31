"use client";

import { AlertTriangle, BookmarkPlus, Gauge, Info, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { quickCheck } from "@/lib/dojo/heuristics";
import { DIMENSIONS, type AnalysisResult, type Dimension } from "@/lib/dojo/schema";
import type { TargetSpec } from "@/lib/dojo/targets";
import { api, ApiError, readLocal, setHandoff, takeHandoff, writeLocal, type ServedBy } from "./client";
import { DiffView, TargetPicker } from "./editor";
import { useDojo } from "./provider";
import { SaveToLibraryDialog, type SaveDraft } from "./save-dialog";
import { CopyButton, ErrorBox, Notice, PageHeader, ProviderBadge, Spinner } from "./ui";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  goal_clarity: "Goal clarity",
  context_completeness: "Context completeness",
  instruction_precision: "Instruction precision",
  constraint_quality: "Constraint quality",
  output_specificity: "Output specificity",
  internal_consistency: "Internal consistency",
  reusability: "Reusability",
};

type Analysis = AnalysisResult & { composite: number };

function ScoreRing({ value, label }: { value: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={`${label}: ${value} out of 100`}>
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--pd-line)" strokeWidth="8" />
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--pd-accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 46 46)" />
        <text x="46" y="52" textAnchor="middle" fontSize="22" fontWeight="650" fill="var(--pd-ink)">
          {value}
        </text>
      </svg>
      <span className="mt-1 text-xs pd-muted">{label}</span>
    </div>
  );
}

function Bars({ scores, rationale }: { scores: Record<Dimension, number>; rationale?: Partial<Record<Dimension, string>> }) {
  return (
    <ul className="space-y-2.5">
      {DIMENSIONS.map((d) => (
        <li key={d}>
          <div className="flex items-baseline justify-between text-sm">
            <span>{DIMENSION_LABELS[d]}</span>
            <span className="font-semibold tabular-nums">{scores[d]}/10</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full pd-surface-2" role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={scores[d]} aria-label={DIMENSION_LABELS[d]}>
            <div className="h-full rounded-full" style={{ width: `${scores[d] * 10}%`, background: "var(--pd-accent)" }} />
          </div>
          {rationale?.[d] && <p className="mt-1 text-xs pd-muted">{rationale[d]}</p>}
        </li>
      ))}
    </ul>
  );
}

export function AnalyzerPage() {
  const router = useRouter();
  const { prefs, status } = useDojo();
  const [prompt, setPrompt] = useState("");
  const [target, setTarget] = useState<TargetSpec>({ id: "universal" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [servedBy, setServedBy] = useState<ServedBy | null>(null);
  const [injection, setInjection] = useState(false);
  const [view, setView] = useState<"revised" | "compare">("revised");
  const [saveDraft, setSaveDraft] = useState<SaveDraft | null>(null);

  useEffect(() => {
    const h = takeHandoff("analyzer");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after hydration
    setPrompt(h?.prompt ?? readLocal("pd-analyzer-draft", ""));
    setTarget({ id: prefs.default_target });
  }, [prefs.default_target]);
  useEffect(() => writeLocal("pd-analyzer-draft", prompt), [prompt]);

  const quick = useMemo(() => quickCheck(prompt), [prompt]);

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ result: Analysis; servedBy: ServedBy; injectionWarning: boolean }>("/api/dojo/analyze", { body: { prompt, target } });
      setResult(r.result);
      setServedBy(r.servedBy);
      setInjection(r.injectionWarning);
      setView("revised");
    } catch (e) {
      setError({ message: (e as Error).message, retryable: e instanceof ApiError ? e.retryable : true });
    } finally {
      setBusy(false);
    }
  }

  const aiScores = result ? (Object.fromEntries(DIMENSIONS.map((d) => [d, result.scores[d].score])) as Record<Dimension, number>) : null;
  const rationale = result ? Object.fromEntries(DIMENSIONS.map((d) => [d, result.scores[d].rationale])) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Prompt Analyzer" subtitle="Paste any prompt to see where it's strong, what's missing, and an improved version." />

      <section className="pd-card space-y-4 p-4 sm:p-5">
        <label htmlFor="pd-analyze-input" className="text-sm font-medium">
          Your prompt
        </label>
        <textarea id="pd-analyze-input" className="pd-textarea pd-prompt-text min-h-48" value={prompt} maxLength={30000} onChange={(e) => setPrompt(e.target.value)} placeholder="Paste a prompt you use today…" />
        <TargetPicker value={target} onChange={setTarget} label="Intended model" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="pd-btn pd-btn-primary" onClick={analyze} disabled={busy || !prompt.trim() || !status?.active}>
            {busy ? <Spinner size={15} label="Analyzing…" /> : <><Gauge size={16} aria-hidden /> Analyze my prompt</>}
          </button>
          <span className="text-xs pd-muted">{quick.words} words · quick check updates as you type (runs on this device, no AI)</span>
        </div>
        {error && <ErrorBox message={error.message} onRetry={error.retryable ? analyze : undefined} onDismiss={() => setError(null)} />}
      </section>

      <Notice tone="neutral" icon={<Info size={16} />}>
        Scores are <strong>heuristic quality indicators</strong> — an informed opinion about clarity and completeness, not a scientific measure of how well a prompt will perform. To learn how a prompt actually performs, run it in the Testing Lab.
      </Notice>

      <div className="grid gap-5 lg:grid-cols-2">
        {prompt.trim() && (
          <section className="pd-card p-4 sm:p-5" aria-labelledby="pd-quick">
            <div className="mb-4 flex items-center gap-4">
              <ScoreRing value={quick.composite} label="Quick check" />
              <div>
                <h2 id="pd-quick" className="font-semibold">
                  Quick check
                </h2>
                <p className="text-sm pd-soft">Simple text rules — instant and private.</p>
              </div>
            </div>
            <Bars scores={quick.scores} />
            <ul className="mt-4 space-y-1 text-sm">
              {quick.findings.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden style={{ color: f.ok ? "var(--pd-ok)" : "var(--pd-warn)" }}>
                    {f.ok ? "✓" : "!"}
                  </span>
                  <span className={f.ok ? "pd-soft" : ""}>{f.note}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result && aiScores && (
          <section className="pd-card pd-fade-in p-4 sm:p-5" aria-labelledby="pd-ai-scores">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <ScoreRing value={result.composite} label="AI review" />
              <div className="min-w-0 flex-1">
                <h2 id="pd-ai-scores" className="font-semibold">
                  AI review
                </h2>
                <ProviderBadge servedBy={servedBy} />
              </div>
            </div>
            <Bars scores={aiScores} rationale={rationale} />
          </section>
        )}
      </div>

      {result && (
        <>
          {injection && (
            <Notice tone="warn" icon={<AlertTriangle size={16} />}>
              This prompt contains text that tries to override an AI&apos;s instructions. It was analyzed as content, not followed.
            </Notice>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["Strengths", result.strengths],
                ["Weaknesses", result.weaknesses],
                ["Missing information", result.missing_information],
                ["Suggested improvements", result.suggestions],
              ] as const
            ).map(([t, items]) => (
              <section key={t} className="pd-card p-4">
                <h3 className="mb-2 text-sm font-semibold">{t}</h3>
                {items.length ? (
                  <ul className="list-disc space-y-1 pl-4 text-sm pd-soft">
                    {items.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm pd-muted">None noted.</p>
                )}
              </section>
            ))}
          </div>

          <section className="pd-card space-y-4 p-4 sm:p-5" aria-labelledby="pd-revised">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="pd-revised" className="pd-serif flex-1 text-xl font-semibold">
                Revised prompt
              </h2>
              <div className="flex gap-1" role="tablist" aria-label="View">
                <button type="button" role="tab" aria-selected={view === "revised"} className="pd-chip" onClick={() => setView("revised")}>
                  Revised
                </button>
                <button type="button" role="tab" aria-selected={view === "compare"} className="pd-chip" onClick={() => setView("compare")}>
                  Before / After
                </button>
              </div>
            </div>
            {view === "revised" ? <div className="pd-prompt-text rounded-xl border p-4 pd-line">{result.revised_prompt}</div> : <DiffView before={prompt} after={result.revised_prompt} labels={["Your prompt", "Revised"]} />}
            {result.revision_notes.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-semibold">What was changed</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm pd-soft">
                  {result.revision_notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs pd-muted">The revision is designed to address the issues above. Whether it performs better for your task can only be shown by testing both versions.</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={result.revised_prompt} label="Copy revised" primary />
              <button type="button" className="pd-btn" onClick={() => setSaveDraft({ title: "Revised prompt", target_model: target.id, custom_target: target.customName, source: "analyzer", versions: [{ content: prompt, kind: "imported", instruction: "Original pasted into Analyzer" }, { content: result.revised_prompt, kind: "analyzed", instruction: "Analyzer revision" }] })}>
                <BookmarkPlus size={15} aria-hidden /> Save both to library
              </button>
              <button type="button" className="pd-btn" onClick={() => { setHandoff({ to: "lab", prompt: result.revised_prompt }); router.push("/dojo/lab"); }}>
                Test in Lab
              </button>
              <button type="button" className="pd-btn pd-btn-ghost" onClick={() => setPrompt(result.revised_prompt)}>
                <Sparkles size={15} aria-hidden /> Analyze the revision
              </button>
            </div>
          </section>
        </>
      )}

      <SaveToLibraryDialog open={!!saveDraft} draft={saveDraft} onClose={() => setSaveDraft(null)} onSaved={() => {}} />
    </div>
  );
}
