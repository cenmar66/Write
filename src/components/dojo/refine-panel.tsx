"use client";

import { Wand2 } from "lucide-react";
import { useState } from "react";
import type { AdaptationResult, RefinementResult, TemplateResult } from "@/lib/dojo/schema";
import { REFINEMENTS } from "@/lib/dojo/refinements";
import type { TargetSpec } from "@/lib/dojo/targets";
import { targetName } from "@/lib/dojo/targets";
import { api, ApiError, type ServedBy } from "./client";
import { TargetPicker } from "./editor";
import { Dialog, ErrorBox, Spinner } from "./ui";

export type RefineOutcome = {
  content: string;
  kind: "refined" | "adapted";
  instruction: string;
  label: string;
  summary: string;
  changes: { what: string; why: string }[];
  intentNote?: string;
  intentPreserved?: boolean;
  servedBy: ServedBy;
  newTarget?: TargetSpec;
};

/**
 * One-click and free-form refinements. The prompt passed in is never modified here;
 * results are handed back as a new version, so a failed request loses nothing.
 */
export function RefinePanel({
  prompt,
  target,
  originalRequest,
  onResult,
  onTemplate,
  disabled,
}: {
  prompt: string;
  target: TargetSpec;
  originalRequest?: string;
  onResult: (r: RefineOutcome) => void;
  onTemplate: (t: TemplateResult, servedBy: ServedBy) => void;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [adaptTo, setAdaptTo] = useState<TargetSpec>({ id: target.id === "claude" ? "chatgpt" : "claude" });

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const retryable = e instanceof ApiError ? e.retryable : true;
      setError({ message: (e as Error).message, retry: retryable ? () => void run(key, fn) : () => setError(null) });
    } finally {
      setBusy(null);
    }
  }

  const refine = (instruction: string, label: string, key: string) =>
    run(key, async () => {
      const r = await api<{ result: RefinementResult; servedBy: ServedBy }>("/api/dojo/refine", { body: { prompt, instruction, action: key, target, originalRequest } });
      onResult({ content: r.result.prompt, kind: "refined", instruction, label, summary: r.result.change_summary, changes: r.result.changes, intentNote: r.result.intent_note, intentPreserved: r.result.intent_preserved, servedBy: r.servedBy });
      if (key === "custom") setCustom("");
    });

  const adapt = () =>
    run("adapt", async () => {
      const r = await api<{ result: AdaptationResult; servedBy: ServedBy }>("/api/dojo/adapt", { body: { prompt, from: target, to: adaptTo } });
      setAdaptOpen(false);
      onResult({ content: r.result.prompt, kind: "adapted", instruction: `Adapted for ${targetName(adaptTo)}`, label: `Adapted for ${targetName(adaptTo)}`, summary: `Adapted from ${targetName(target)} to ${targetName(adaptTo)}.`, changes: r.result.adaptations.map((a) => ({ what: a.change, why: a.reason })), servedBy: r.servedBy, newTarget: adaptTo });
    });

  const template = () =>
    run("template", async () => {
      const r = await api<{ result: TemplateResult; servedBy: ServedBy }>("/api/dojo/to-template", { body: { prompt } });
      onTemplate(r.result, r.servedBy);
    });

  const off = disabled || !!busy || !prompt.trim();

  return (
    <section className="pd-card space-y-3.5 p-4" aria-labelledby="pd-refine-title">
      <div className="flex items-center gap-2">
        <Wand2 size={17} className="pd-accent-text" aria-hidden />
        <h3 id="pd-refine-title" className="font-semibold">
          Refine
        </h3>
        {busy && (
          <span className="ml-auto text-sm pd-muted">
            <Spinner size={14} label={busy === "adapt" ? "Adapting…" : busy === "template" ? "Building template…" : "Refining…"} />
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {REFINEMENTS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="pd-chip"
            disabled={off}
            aria-busy={busy === r.id}
            onClick={() => (r.service === "adapt" ? setAdaptOpen(true) : r.service === "template" ? template() : refine(r.instruction, r.label, r.id))}
          >
            {r.label}
          </button>
        ))}
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) refine(custom.trim(), custom.trim().slice(0, 60), "custom");
        }}
      >
        <label htmlFor="pd-refine-custom" className="sr-only">
          How would you like to improve this prompt?
        </label>
        <input
          id="pd-refine-custom"
          className="pd-input flex-1"
          placeholder="How would you like to improve this prompt? e.g. “Make the output a detailed table”"
          value={custom}
          maxLength={2000}
          onChange={(e) => setCustom(e.target.value)}
          disabled={disabled}
        />
        <button type="submit" className="pd-btn pd-btn-primary" disabled={off || !custom.trim()}>
          Improve
        </button>
      </form>
      {error && <ErrorBox message={error.message} onRetry={error.retry} onDismiss={() => setError(null)} />}

      <Dialog open={adaptOpen} onClose={() => setAdaptOpen(false)} title="Adapt for another model">
        <div className="space-y-4">
          <p className="text-sm pd-soft">Keeps the content and requirements; changes structure and phrasing to suit the target&apos;s published prompting conventions.</p>
          <TargetPicker value={adaptTo} onChange={setAdaptTo} label="Adapt for" />
          <div className="flex justify-end gap-2">
            <button type="button" className="pd-btn" onClick={() => setAdaptOpen(false)}>
              Cancel
            </button>
            <button type="button" className="pd-btn pd-btn-primary" onClick={adapt} disabled={!!busy}>
              {busy === "adapt" ? <Spinner size={14} label="Adapting…" /> : "Adapt"}
            </button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
