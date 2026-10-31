"use client";

import { ArrowLeft, FlaskConical, Gauge, Save, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { TemplateResult } from "@/lib/dojo/schema";
import type { TargetSpec } from "@/lib/dojo/targets";
import type { Collection, PromptRecord, PromptVersion, TestRun } from "@/lib/dojo/store/types";
import { api, formatCost, formatDate, setHandoff } from "./client";
import { PromptEditor, TargetPicker } from "./editor";
import { useDojo } from "./provider";
import { RefinePanel, type RefineOutcome } from "./refine-panel";
import { CATEGORIES, SaveTemplateDialog } from "./save-dialog";
import { CopyButton, EmptyState, ErrorBox, Field, Spinner } from "./ui";
import { VersionList } from "./versions";

type Full = PromptRecord & { versions: PromptVersion[] };

const KIND_LABEL: Record<string, string> = { generated: "Generated", alternative: "Alternative", refined: "Refined", edited: "Edited", adapted: "Adapted", imported: "Imported", restored: "Restored", analyzed: "Analyzer revision", template: "From template" };

export function PromptDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useDojo();
  const [p, setP] = useState<Full | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const [meta, setMeta] = useState({ title: "", description: "", category: "", collection_id: "", tags: "" });
  const [target, setTarget] = useState<TargetSpec>({ id: "universal" });
  const [collections, setCollections] = useState<Collection[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [savingMeta, setSavingMeta] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<TemplateResult | null>(null);

  const load = useCallback(async () => {
    try {
      const { prompt } = await api<{ prompt: Full }>(`/api/dojo/prompts/${id}`);
      setP(prompt);
      setCursor(prompt.versions.length - 1);
      setWorking(null);
      setMeta({ title: prompt.title, description: prompt.description, category: prompt.category, collection_id: prompt.collection_id ?? "", tags: prompt.tags.join(", ") });
      setTarget({ id: prompt.target_model, customName: prompt.custom_target || undefined });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set after the request resolves
    void load();
    api<{ collections: Collection[] }>("/api/dojo/collections").then((r) => setCollections(r.collections)).catch(() => {});
    api<{ runs: TestRun[] }>(`/api/dojo/lab/runs?prompt=${id}`).then((r) => setRuns(r.runs)).catch(() => {});
  }, [load, id]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!p)
    return (
      <div className="space-y-3">
        <div className="pd-skeleton h-10 w-1/2" />
        <div className="pd-skeleton h-72" />
      </div>
    );
  if (p.versions.length === 0) return <EmptyState icon={<Save size={20} />} title="This prompt has no versions" />;

  const current = p.versions[cursor];
  const text = working ?? current.content;
  const dirty = working !== null && working !== current.content;

  async function addVersion(content: string, kind: string, instruction = "", servedBy?: { provider: string; model: string }) {
    const { version } = await api<{ version: PromptVersion }>(`/api/dojo/prompts/${id}/versions`, { body: { content, kind, instruction, provider: servedBy?.provider ?? null, model: servedBy?.model ?? null } });
    setP((x) => (x ? { ...x, versions: [...x.versions, version], content, version_count: x.versions.length + 1 } : x));
    setCursor(version.version_no - 1);
    setWorking(null);
    return version;
  }

  async function saveEdit() {
    try {
      await addVersion(text, "edited");
      toast("Saved as a new version", "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function onRefined(r: RefineOutcome) {
    try {
      if (dirty) await addVersion(text, "edited");
      await addVersion(r.content, r.kind, r.instruction, r.servedBy);
      if (r.newTarget) {
        await api(`/api/dojo/prompts/${id}`, { method: "PATCH", body: { target_model: r.newTarget.id, custom_target: r.newTarget.customName ?? "" } });
        setTarget(r.newTarget);
      }
      toast(r.summary || "Refined", "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await api(`/api/dojo/prompts/${id}`, {
        method: "PATCH",
        body: { title: meta.title.trim() || "Untitled prompt", description: meta.description, category: meta.category, collection_id: meta.collection_id || null, tags: meta.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20), target_model: target.id, custom_target: target.customName ?? "" },
      });
      toast("Details saved", "ok");
      void load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSavingMeta(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dojo/library" className="pd-btn pd-btn-ghost pd-btn-sm">
          <ArrowLeft size={15} aria-hidden /> Library
        </Link>
        {p.deleted_at && <span className="pd-badge pd-badge-danger">In trash</span>}
        {p.archived_at && <span className="pd-badge">Archived</span>}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="pd-serif min-w-0 flex-1 text-[1.85rem] leading-tight font-semibold">{p.title}</h1>
        <button type="button" className="pd-btn pd-btn-icon" aria-label={p.favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={p.favorite} onClick={async () => { await api(`/api/dojo/prompts/${id}`, { method: "PATCH", body: { favorite: !p.favorite } }); setP({ ...p, favorite: !p.favorite }); }}>
          <Star size={17} fill={p.favorite ? "currentColor" : "none"} style={p.favorite ? { color: "var(--pd-accent)" } : undefined} />
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <section className="pd-card space-y-3.5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">
                v{cursor + 1} · {KIND_LABEL[current.kind] ?? current.kind}
              </span>
              <span className="pd-muted">{formatDate(current.created_at)}</span>
              {current.model && <span className="pd-badge pd-mono">{current.model}</span>}
              {cursor !== p.versions.length - 1 && (
                <button type="button" className="ml-auto text-sm font-semibold underline" onClick={() => { setCursor(p.versions.length - 1); setWorking(null); }}>
                  Back to latest
                </button>
              )}
            </div>
            {current.instruction && <p className="text-sm pd-soft">“{current.instruction}”</p>}
            <PromptEditor key={current.id} id="pd-detail-editor" label="Prompt text" value={text} onChange={setWorking} />
            <div className="flex flex-wrap gap-2">
              <CopyButton text={text} primary />
              <button type="button" className="pd-btn" onClick={saveEdit} disabled={!dirty}>
                <Save size={15} aria-hidden /> Save as new version
              </button>
              {dirty && (
                <button type="button" className="pd-btn pd-btn-ghost" onClick={() => setWorking(null)}>
                  Discard edit
                </button>
              )}
              <button type="button" className="pd-btn" onClick={() => { setHandoff({ to: "lab", prompt: text, promptId: p.id, versionId: current.id, title: p.title }); router.push("/dojo/lab"); }}>
                <FlaskConical size={15} aria-hidden /> Test
              </button>
              <button type="button" className="pd-btn" onClick={() => { setHandoff({ to: "analyzer", prompt: text }); router.push("/dojo/analyzer"); }}>
                <Gauge size={15} aria-hidden /> Analyze
              </button>
            </div>
          </section>

          <RefinePanel prompt={text} target={target} onResult={onRefined} onTemplate={(t) => setTemplateDraft(t)} />

          {runs.length > 0 && (
            <section className="pd-card p-4" aria-labelledby="pd-detail-runs">
              <h2 id="pd-detail-runs" className="mb-2 text-sm font-semibold">
                Test runs
              </h2>
              <ul className="space-y-1.5 text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex flex-wrap gap-2">
                    <span className={`pd-badge ${r.is_mock ? "pd-badge-warn" : ""}`}>{r.is_mock ? "mock" : r.model}</span>
                    <span className="pd-muted">{formatDate(r.created_at)}</span>
                    <span className="pd-muted">{formatCost(r.cost_usd)}</span>
                    <span>{r.ratings.filter((x) => x.score).map((x) => `${x.name} ${x.score}/5`).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="pd-card space-y-3 p-4" aria-labelledby="pd-details">
            <h2 id="pd-details" className="text-sm font-semibold">
              Details
            </h2>
            <Field label="Title" htmlFor="pd-d-title">
              <input id="pd-d-title" className="pd-input" value={meta.title} maxLength={200} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="pd-d-desc">
              <textarea id="pd-d-desc" className="pd-textarea min-h-16" value={meta.description} maxLength={2000} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </Field>
            <Field label="Category" htmlFor="pd-d-cat">
              <select id="pd-d-cat" className="pd-select" value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>
                <option value="">None</option>
                {[...new Set([...CATEGORIES, meta.category].filter(Boolean))].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Collection" htmlFor="pd-d-col">
              <select id="pd-d-col" className="pd-select" value={meta.collection_id} onChange={(e) => setMeta({ ...meta, collection_id: e.target.value })}>
                <option value="">None</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags" hint="Separate with commas" htmlFor="pd-d-tags">
              <input id="pd-d-tags" className="pd-input" value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} />
            </Field>
            <TargetPicker value={target} onChange={setTarget} />
            <button type="button" className="pd-btn pd-btn-primary w-full" onClick={saveMeta} disabled={savingMeta}>
              {savingMeta ? <Spinner size={14} label="Saving…" /> : "Save details"}
            </button>
          </section>

          <VersionList
            versions={p.versions.map((v) => ({ id: v.id, content: v.content, label: KIND_LABEL[v.kind] ?? v.kind, createdAt: v.created_at, kind: v.kind, summary: v.instruction || undefined, model: v.model }))}
            currentIndex={cursor}
            onSelect={(i) => { setCursor(i); setWorking(null); }}
            onRestore={async (i) => {
              try {
                await addVersion(p.versions[i].content, "restored", `Restored v${i + 1}`);
                toast(`Restored v${i + 1} as a new version`, "ok");
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          />

          <section className="pd-card space-y-2 p-4">
            <p className="text-xs pd-muted">
              Created {formatDate(p.created_at)} · source: {p.source}
            </p>
            <div className="flex flex-wrap gap-2">
              <a className="pd-btn pd-btn-sm" href={`/api/dojo/export?format=md&ids=${p.id}`}>
                Export .md
              </a>
              <a className="pd-btn pd-btn-sm" href={`/api/dojo/export?format=json&ids=${p.id}`}>
                Export .json
              </a>
              {p.deleted_at ? (
                <button type="button" className="pd-btn pd-btn-sm" onClick={async () => { await api(`/api/dojo/prompts/${id}`, { method: "PATCH", body: { restore: true } }); void load(); }}>
                  Restore from trash
                </button>
              ) : (
                <button type="button" className="pd-btn pd-btn-sm pd-btn-danger" onClick={async () => { await api(`/api/dojo/prompts/${id}`, { method: "DELETE" }); toast("Moved to trash", "ok"); router.push("/dojo/library"); }}>
                  <Trash2 size={14} aria-hidden /> Move to trash
                </button>
              )}
            </div>
          </section>
        </aside>
      </div>
      <SaveTemplateDialog open={!!templateDraft} initial={templateDraft} onClose={() => setTemplateDraft(null)} />
    </div>
  );
}
