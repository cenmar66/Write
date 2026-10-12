"use client";

import { Check, ChevronUp, Cpu, Laptop } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_MODEL, findModel, MODELS } from "@/lib/ai/models";
import { createClient } from "@/lib/supabase/client";

/** Reads and saves the chosen AI model (stored in Supabase, so it syncs across devices). */
function useAiModel() {
  const supabase = useMemo(() => createClient(), []);
  const [modelId, setModelId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("user_settings")
      .select("ai_model")
      .maybeSingle()
      .then(({ data }) => setModelId(findModel(data?.ai_model ?? DEFAULT_MODEL).id));
  }, [supabase]);

  async function choose(id: string) {
    const previous = modelId;
    setModelId(id);
    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: session.session?.user.id, ai_model: id, updated_at: new Date().toISOString() });
    if (error) setModelId(previous);
  }

  return { model: modelId ? findModel(modelId) : null, choose };
}

/** Full list for the Settings page. */
export function ModelList() {
  const { model, choose } = useAiModel();

  return (
    <div className="space-y-2" role="radiogroup" aria-label="AI model">
      {MODELS.map((m) => {
        const active = model?.id === m.id;
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={active}
            onClick={() => choose(m.id)}
            className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left ring-1 transition ${
              active ? "bg-surface-strong ring-accent" : "ring-line hover:bg-surface-strong/60"
            }`}
          >
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                active ? "bg-gradient-brand text-white" : "bg-surface-strong text-muted"
              }`}
            >
              <Cpu size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 font-medium">
                {m.label}
                {m.id === DEFAULT_MODEL && <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] text-muted">default</span>}
              </span>
              <span className="block text-sm text-muted">{m.blurb}</span>
            </span>
            <span className="hidden shrink-0 text-xs text-muted sm:block">{m.cost}</span>
            <span className={`grid size-5 shrink-0 place-items-center rounded-full ${active ? "bg-accent text-white" : "ring-1 ring-line"}`}>
              {active && <Check size={13} />}
            </span>
          </button>
        );
      })}
      <div className="flex items-center gap-4 rounded-2xl p-4 opacity-60 ring-1 ring-line ring-dashed">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-strong text-muted">
          <Laptop size={18} />
        </span>
        <span className="flex-1">
          <span className="font-medium">Local AI</span>
          <span className="block text-sm text-muted">Run a model on your own computer. Coming later.</span>
        </span>
      </div>
    </div>
  );
}

/** Small switcher for the editor's bottom dock. */
export function ModelChip() {
  const { model, choose } = useAiModel();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        aria-label="Choose AI model"
        className="flex items-center gap-1 rounded-full px-3 py-2 text-xs text-muted transition hover:bg-surface-strong hover:text-ink"
      >
        <Cpu size={13} />
        {model?.short ?? "…"}
        <ChevronUp size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-12 left-1/2 z-40 w-64 -translate-x-1/2 rounded-2xl border border-line bg-bg p-1.5 shadow-xl">
            <p className="px-3 pt-1.5 pb-1 text-xs text-muted">AI model</p>
            {MODELS.map((m) => (
              <button
                key={m.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  choose(m.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-strong"
              >
                <span className="flex-1">
                  {m.label}
                  <span className="block text-xs text-muted">{m.cost}</span>
                </span>
                {model?.id === m.id && <Check size={15} className="text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
