"use client";

import { FlaskConical, Info, Play, Plus, Save, Scale, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { JudgeResult } from "@/lib/satori/schema";
import type { PromptRecord, TestRun } from "@/lib/satori/store/types";
import { extractVariables, fillVariables } from "@/lib/satori/variables";
import { api, ApiError, formatCost, formatDate, readLocal, takeHandoff, writeLocal } from "./client";
import { Attachments, toImageInputs, toSourceInputs, type AttachedImage, type AttachedSource } from "./attachments";
import type { Connector } from "@/lib/satori/store/types";
import { useSatori } from "./provider";
import { CopyButton, EmptyState, ErrorBox, Notice, PageHeader, Spinner } from "./ui";

type Criterion = { name: string; description: string };
const DEFAULT_CRITERIA: Criterion[] = [
  { name: "Relevance", description: "Addresses the task that was asked" },
  { name: "Completeness", description: "Covers everything the prompt requires" },
  { name: "Accuracy vs reference", description: "Consistent with the reference material supplied (not general truth)" },
  { name: "Format adherence", description: "Follows the requested structure, length and format" },
];

type RunResult =
  | { ok: true; text: string; provider: string; providerLabel: string; isMock: boolean; requestedModel: string; model: string; latencyMs: number; usage: { inputTokens: number; outputTokens: number; webSearches?: number } | null; costUsd: number | null; stopReason: string | null; activity?: string[]; toolsSkipped?: boolean }
  | { ok: false; provider: string; model: string; error: string };

type Rating = { score: number | null; note: string };

export function LabPage() {
  const { status, toast } = useSatori();
  const [source, setSource] = useState<"paste" | "library">("paste");
  const [library, setLibrary] = useState<PromptRecord[]>([]);
  const [promptId, setPromptId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [picked, setSelected] = useState<string[] | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>(DEFAULT_CRITERIA);
  const [reference, setReference] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [sources, setSources] = useState<AttachedSource[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [useConnectors, setUseConnectors] = useState<string[]>([]);
  const [lastRunContext, setLastRunContext] = useState<{ images: number; sources: string[]; webSearch: boolean; connectors: string[] }>({ images: 0, sources: [], webSearch: false, connectors: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [results, setResults] = useState<RunResult[]>([]);
  const [ratings, setRatings] = useState<Record<number, Record<string, Rating>>>({});
  const [judging, setJudging] = useState<number | null>(null);
  const [judges, setJudges] = useState<Record<number, JudgeResult>>({});
  const [history, setHistory] = useState<TestRun[]>([]);

  const models = useMemo(() => (status?.providers ?? []).filter((p) => p.configured).flatMap((p) => p.models.map((m) => ({ key: `${p.id}::${m.id}`, provider: p.id, providerLabel: p.label, model: m.id, label: m.label, isMock: p.isMock, supportsTools: !!p.supportsTools }))), [status]);

  useEffect(() => {
    const h = takeHandoff("lab");
    if (h) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after hydration
      setPrompt(h.prompt);
      setPromptId(h.promptId ?? null);
    } else setPrompt(readLocal("ps-lab-draft", ""));
    setCriteria(readLocal("ps-lab-criteria", DEFAULT_CRITERIA));
    api<{ prompts: PromptRecord[] }>("/api/satori/prompts?sort=updated")
      .then((r) => setLibrary(r.prompts))
      .catch(() => {});
    api<{ connectors: Connector[] }>("/api/satori/connectors")
      .then((r) => setConnectors(r.connectors.filter((c) => c.enabled)))
      .catch(() => {});
    api<{ runs: TestRun[] }>("/api/satori/lab/runs")
      .then((r) => setHistory(r.runs))
      .catch(() => {});
  }, []);
  useEffect(() => writeLocal("ps-lab-draft", prompt), [prompt]);
  useEffect(() => writeLocal("ps-lab-criteria", criteria), [criteria]);
  // Until you pick, run on the generation model (or the first connected one).
  const selected = useMemo(() => {
    if (picked) return picked;
    const preferred = status?.active ? `${status.active.provider}::${status.active.model}` : "";
    return models.some((m) => m.key === preferred) ? [preferred] : models.slice(0, 1).map((m) => m.key);
  }, [picked, models, status]);

  const vars = useMemo(() => extractVariables(prompt), [prompt]);
  const missingVars = vars.filter((v) => !values[v]?.trim());

  async function runAll() {
    setBusy(true);
    setError(null);
    setResults([]);
    setRatings({});
    setJudges({});
    try {
      const targets = selected.map((k) => models.find((m) => m.key === k)!).filter(Boolean).map((m) => ({ provider: m.provider, model: m.model }));
      const r = await api<{ results: RunResult[] }>("/api/satori/lab/run", {
        body: { prompt, variables: values, targets, images: toImageInputs(images), sources: toSourceInputs(sources), webSearch, connectorIds: useConnectors },
      });
      setLastRunContext({ images: images.length, sources: sources.map((s) => s.url), webSearch, connectors: connectors.filter((c) => useConnectors.includes(c.id)).map((c) => c.label) });
      setResults(r.results);
    } catch (e) {
      setError({ message: (e as Error).message, retryable: e instanceof ApiError ? e.retryable : true });
    } finally {
      setBusy(false);
    }
  }

  async function judge(i: number) {
    const r = results[i];
    if (!r.ok) return;
    setJudging(i);
    try {
      const j = await api<{ result: JudgeResult }>("/api/satori/lab/judge", { body: { prompt: fillVariables(prompt, values), output: r.text, criteria, reference: reference || undefined } });
      setJudges((x) => ({ ...x, [i]: j.result }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setJudging(null);
    }
  }

  async function save(i: number) {
    const r = results[i];
    if (!r.ok) return;
    try {
      const { run } = await api<{ run: TestRun }>("/api/satori/lab/runs", {
        body: {
          prompt_id: promptId,
          prompt_text: prompt,
          variables: values,
          provider: r.provider,
          model: r.model,
          is_mock: r.isMock,
          output: r.text,
          input_tokens: r.usage?.inputTokens ?? null,
          output_tokens: r.usage?.outputTokens ?? null,
          cost_usd: r.costUsd,
          latency_ms: r.latencyMs,
          ratings: criteria.map((c) => ({ ...c, score: ratings[i]?.[c.name]?.score ?? null, note: ratings[i]?.[c.name]?.note ?? "" })),
          judge: judges[i] ?? null,
          context: { ...lastRunContext, activity: r.activity ?? [] },
        },
      });
      setHistory((h) => [run, ...h]);
      toast("Test run saved", "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Testing Lab" subtitle="Run a prompt against connected AI models, side by side, and judge the results with your own criteria." />

      {models.length === 0 ? (
        <EmptyState icon={<FlaskConical size={22} />} title="No test models connected">
          Connect at least one provider (for example <code className="ps-mono">ANTHROPIC_API_KEY</code>) to run prompts. PromptSatori never simulates real model responses.
        </EmptyState>
      ) : (
        <>
          <section className="ps-card space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Prompt source">
              <button type="button" role="tab" aria-selected={source === "paste"} className="ps-chip" onClick={() => setSource("paste")}>
                Paste or edit
              </button>
              <button type="button" role="tab" aria-selected={source === "library"} className="ps-chip" onClick={() => setSource("library")}>
                From my library
              </button>
            </div>
            {source === "library" && (
              <select
                className="ps-select"
                aria-label="Choose a saved prompt"
                value={promptId ?? ""}
                onChange={(e) => {
                  const p = library.find((x) => x.id === e.target.value);
                  setPromptId(p?.id ?? null);
                  if (p) setPrompt(p.content);
                }}
              >
                <option value="">Choose a saved prompt…</option>
                {library.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} (v{p.version_count})
                  </option>
                ))}
              </select>
            )}
            <div>
              <label htmlFor="ps-lab-prompt" className="mb-1.5 block text-sm font-medium">
                Prompt
              </label>
              <textarea id="ps-lab-prompt" className="ps-textarea ps-prompt-text min-h-44" value={prompt} maxLength={30000} onChange={(e) => { setPrompt(e.target.value); if (source === "paste") setPromptId(null); }} placeholder="Paste a prompt, or pick one from your library…" />
            </div>

            {vars.length > 0 && (
              <fieldset className="space-y-2.5">
                <legend className="text-sm font-medium">Variables</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {vars.map((v) => (
                    <label key={v} className="space-y-1 text-sm">
                      <span className="ps-mono text-xs">{`{{${v}}}`}</span>
                      <textarea className="ps-textarea min-h-12 py-1.5" value={values[v] ?? ""} onChange={(e) => setValues({ ...values, [v]: e.target.value })} />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <p className="mb-1.5 text-sm font-medium">Attachments</p>
              <Attachments images={images} sources={sources} onImages={setImages} onSources={setSources} disabled={busy} imageHint="Images are sent with the prompt, for prompts that work on pictures." />
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium">Tools <span className="font-normal ps-muted">(Claude only)</span></legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--ps-accent)]" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} />
                Let Claude search the web <span className="text-xs ps-muted">(about 1¢ per search, up to 5 per run)</span>
              </label>
              {connectors.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm">Connected apps:</span>
                  {connectors.map((c) => {
                    const on = useConnectors.includes(c.id);
                    return (
                      <button key={c.id} type="button" aria-pressed={on} className="ps-chip" disabled={!on && useConnectors.length >= 5} onClick={() => setUseConnectors(on ? useConnectors.filter((x) => x !== c.id) : [...useConnectors, c.id])}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs ps-muted">
                  No connected apps yet. Add them in <a className="underline" href="/satori/settings#connectors">Settings → Connected apps</a>.
                </p>
              )}
              {(webSearch || useConnectors.length > 0) && models.filter((m) => selected.includes(m.key)).some((m) => !m.supportsTools) && (
                <p className="text-xs" style={{ color: "var(--ps-warn)" }}>
                  Non-Claude models in this run will answer without web search or connected apps.
                </p>
              )}
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Run on (up to 3)</legend>
              <div className="flex flex-wrap gap-1.5">
                {models.map((m) => {
                  const on = selected.includes(m.key);
                  return (
                    <button key={m.key} type="button" aria-pressed={on} className="ps-chip" disabled={!on && selected.length >= 3} onClick={() => setSelected(on ? selected.filter((k) => k !== m.key) : [...selected, m.key])}>
                      {m.isMock ? "⚠ " : ""}
                      {m.providerLabel.split(" ")[0]} · {m.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="ps-btn ps-btn-primary" onClick={runAll} disabled={busy || !prompt.trim() || !selected.length}>
                {busy ? <Spinner size={15} label="Running…" /> : <><Play size={15} aria-hidden /> Run test</>}
              </button>
              {missingVars.length > 0 && <span className="text-xs" style={{ color: "var(--ps-warn)" }}>Unfilled: {missingVars.map((v) => `{{${v}}}`).join(", ")} (sent as-is)</span>}
            </div>
            {error && <ErrorBox message={error.message} onRetry={error.retryable ? runAll : undefined} onDismiss={() => setError(null)} />}
          </section>

          <details className="ps-card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Evaluation criteria &amp; reference material</summary>
            <div className="mt-3 space-y-3">
              {criteria.map((c, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <input className="ps-input w-44 py-1.5 text-sm" aria-label="Criterion name" value={c.name} maxLength={80} onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input className="ps-input min-w-48 flex-1 py-1.5 text-sm" aria-label="Criterion description" value={c.description} maxLength={400} onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <button type="button" className="ps-btn ps-btn-sm ps-btn-ghost ps-btn-icon" aria-label={`Remove ${c.name}`} onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" className="ps-btn ps-btn-sm" disabled={criteria.length >= 8} onClick={() => setCriteria([...criteria, { name: "New criterion", description: "" }])}>
                  <Plus size={14} aria-hidden /> Add criterion
                </button>
                <button type="button" className="ps-btn ps-btn-sm ps-btn-ghost" onClick={() => setCriteria(DEFAULT_CRITERIA)}>
                  Reset
                </button>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Reference material (optional)</span>
                <textarea className="ps-textarea min-h-20" value={reference} maxLength={30000} onChange={(e) => setReference(e.target.value)} placeholder="Facts or source text the answer should agree with. Accuracy can only be judged against this." />
              </label>
            </div>
          </details>

          {results.length > 0 && (
            <>
              <Notice tone="neutral" icon={<Info size={16} />}>
                Ratings are your judgment. The optional AI first-pass rating is another model&apos;s opinion — useful as a second look, never as proof of factual accuracy.
              </Notice>
              <div className={`grid gap-4 ${results.length === 2 ? "lg:grid-cols-2" : results.length >= 3 ? "lg:grid-cols-3" : ""}`}>
                {results.map((r, i) => (
                  <section key={i} className="ps-card flex min-w-0 flex-col gap-3 p-4" aria-label={`Result ${i + 1}`}>
                    {r.ok ? (
                      <>
                        <div className="space-y-1">
                          {r.isMock ? <span className="ps-badge ps-badge-warn">Mock test provider — not real AI</span> : <span className="ps-badge ps-badge-accent">Answered by {r.providerLabel}</span>}
                          <p className="ps-mono text-xs ps-soft">
                            {r.model}
                            {r.model !== r.requestedModel ? ` (requested ${r.requestedModel})` : ""}
                          </p>
                          <p className="text-xs ps-muted">
                            {(r.latencyMs / 1000).toFixed(1)}s · {r.usage ? `${r.usage.inputTokens.toLocaleString()} in / ${r.usage.outputTokens.toLocaleString()} out` : "usage n/a"} · {formatCost(r.costUsd)}
                            {r.stopReason === "max_tokens" ? " · cut off at length limit" : ""}
                            {r.usage?.webSearches ? ` · ${r.usage.webSearches} web search${r.usage.webSearches > 1 ? "es" : ""}` : ""}
                          </p>
                          {r.toolsSkipped && <p className="text-xs" style={{ color: "var(--ps-warn)" }}>Ran without web search / connected apps (Claude only).</p>}
                          {!!r.activity?.length && (
                            <details className="text-xs">
                              <summary className="cursor-pointer ps-soft">What it did ({r.activity.length})</summary>
                              <ul className="mt-1 list-disc space-y-0.5 pl-4 ps-muted">
                                {r.activity.map((a, j) => (
                                  <li key={j}>{a}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                        <div className="ps-prompt-text max-h-[28rem] overflow-y-auto rounded-xl border p-3 text-sm ps-line">{r.text}</div>
                        <div className="flex flex-wrap gap-2">
                          <CopyButton text={r.text} small />
                          <button type="button" className="ps-btn ps-btn-sm" onClick={() => judge(i)} disabled={judging !== null}>
                            {judging === i ? <Spinner size={13} label="Rating…" /> : <><Scale size={14} aria-hidden /> AI first-pass rating</>}
                          </button>
                          <button type="button" className="ps-btn ps-btn-sm" onClick={() => save(i)}>
                            <Save size={14} aria-hidden /> Save run
                          </button>
                        </div>
                        <div className="space-y-2 border-t pt-3 ps-line">
                          {criteria.map((c) => (
                            <div key={c.name} className="text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span title={c.description}>{c.name}</span>
                                <div className="flex gap-0.5" role="radiogroup" aria-label={`${c.name} rating`}>
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      role="radio"
                                      aria-checked={ratings[i]?.[c.name]?.score === n}
                                      aria-label={`${n} of 5`}
                                      className="size-7 rounded-md text-xs font-semibold"
                                      style={{ background: (ratings[i]?.[c.name]?.score ?? 0) >= n ? "var(--ps-accent)" : "var(--ps-surface-2)", color: (ratings[i]?.[c.name]?.score ?? 0) >= n ? "var(--ps-on-accent)" : "var(--ps-ink-3)" }}
                                      onClick={() => setRatings((x) => ({ ...x, [i]: { ...x[i], [c.name]: { score: n, note: x[i]?.[c.name]?.note ?? "" } } }))}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {judges[i]?.criteria.find((j) => j.name === c.name) && (
                                <p className="mt-0.5 text-xs ps-muted">
                                  AI opinion: {judges[i].criteria.find((j) => j.name === c.name)!.score}/5 — {judges[i].criteria.find((j) => j.name === c.name)!.rationale}
                                </p>
                              )}
                            </div>
                          ))}
                          {judges[i] && <p className="text-xs ps-muted italic">{judges[i].overall_note}</p>}
                        </div>
                      </>
                    ) : (
                      <ErrorBox message={`${r.provider} · ${r.model}: ${r.error}`} />
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {history.length > 0 && (
        <section aria-labelledby="ps-runs">
          <h2 id="ps-runs" className="ps-serif mb-3 text-xl font-semibold">
            Saved runs
          </h2>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="ps-card p-3.5">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{h.prompt_text.slice(0, 70) || "Prompt"}…</span>
                    <span className={`ps-badge ${h.is_mock ? "ps-badge-warn" : ""}`}>{h.is_mock ? "mock" : `${h.provider} · ${h.model}`}</span>
                    <span className="ps-muted text-xs">
                      {formatDate(h.created_at)} · {formatCost(h.cost_usd)}
                    </span>
                    {h.ratings.some((r) => r.score) && <span className="text-xs ps-muted">{h.ratings.filter((r) => r.score).map((r) => `${r.name} ${r.score}/5`).join(" · ")}</span>}
                    <button
                      type="button"
                      className="ps-btn ps-btn-sm ps-btn-ghost ps-btn-icon ml-auto"
                      aria-label="Delete run"
                      onClick={async (e) => {
                        e.preventDefault();
                        await api(`/api/satori/lab/runs/${h.id}`, { method: "DELETE" }).catch(() => {});
                        setHistory((x) => x.filter((y) => y.id !== h.id));
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </summary>
                  <div className="ps-prompt-text mt-3 max-h-80 overflow-y-auto rounded-lg border p-3 text-sm ps-line">{h.output}</div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
