"use client";

import { ArrowLeft, Check, FileText, Layers, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditablePost } from "@/components/social/post-card";
import { PlatformPicker } from "@/components/social/platform-picker";
import { Results } from "@/components/social/results";
import { StyleSelect } from "@/components/style-select";
import { timeAgo } from "@/lib/docs";
import type { GeneratedPost } from "@/lib/social/ai";
import { PLATFORM_IDS, type PlatformId } from "@/lib/social/platforms";
import { CATEGORIES, MAX_REPURPOSE_TEMPLATES, TEMPLATES, type TemplateCategory } from "@/lib/social/templates";
import { createClient } from "@/lib/supabase/client";

type DocRow = { id: string; title: string; word_count: number; updated_at: string };
type Choice = { key: string; name: string; description: string; category: TemplateCategory };

const BUILT_IN: Choice[] = TEMPLATES.map(({ key, name, description, category }) => ({ key, name, description, category }));

export function Repurposer({ docId, auto }: { docId?: string; auto: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [selected, setSelected] = useState<string | undefined>(docId);
  const [platforms, setPlatforms] = useState<PlatformId[]>(PLATFORM_IDS);
  const [perPlatform, setPerPlatform] = useState(1);
  const [posts, setPosts] = useState<EditablePost[]>([]);
  const [loading, setLoading] = useState<PlatformId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);
  const autoRan = useRef(false);
  const [pickMode, setPickMode] = useState<"ai" | "choose">("ai");
  const [picked, setPicked] = useState<string[]>([]);
  const [mine, setMine] = useState<Choice[]>([]);
  const [category, setCategory] = useState<TemplateCategory | "all">("all");

  useEffect(() => {
    supabase
      .from("post_templates")
      .select("id,name,description")
      .order("created_at", { ascending: false })
      .then(({ data }) =>
        setMine(((data ?? []) as { id: string; name: string; description: string | null }[]).map((t) => ({ key: `custom:${t.id}`, name: t.name, description: t.description ?? "", category: "mine" }))),
      );
  }, [supabase]);

  const choices = useMemo(() => [...mine, ...BUILT_IN], [mine]);
  const shown = category === "all" ? choices : choices.filter((c) => c.category === category);
  const usingTemplates = pickMode === "choose" && picked.length > 0;
  const perPlatformCount = usingTemplates ? picked.length : perPlatform;
  const togglePick = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_REPURPOSE_TEMPLATES ? [...p, key] : p));

  useEffect(() => {
    supabase
      .from("documents")
      .select("id,title,word_count,updated_at")
      .gt("word_count", 0)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setDocs((data as DocRow[]) ?? []));
  }, [supabase]);

  const generate = useCallback(async () => {
    if (!selected) return;
    setError(null);
    setPosts([]);
    setLoading(platforms);
    try {
      const res = await fetch("/api/ai/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "repurpose",
          documentId: selected,
          platforms,
          perPlatform,
          templateKeys: usingTemplates ? picked : undefined,
          styleId: styleId ?? undefined,
        }),
      });
      const body = (await res.json()) as { posts?: GeneratedPost[]; error?: string };
      if (!body.posts) throw new Error(body.error);
      setPosts(body.posts);
    } catch (e) {
      setError((e as Error).message || "Repurposing failed. Try again.");
    }
    setLoading(null);
  }, [selected, platforms, perPlatform, styleId, usingTemplates, picked]);

  // From the editor's "Turn into social posts" button: start right away.
  useEffect(() => {
    if (auto && docId && !autoRan.current) {
      autoRan.current = true;
      generate();
    }
  }, [auto, docId, generate]);

  const current = docs?.find((d) => d.id === selected);

  return (
    <div className="animate-rise pb-8">
      <Link href="/posts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Posts
      </Link>
      <header className="mt-3">
        <h1 className="font-display text-4xl tracking-tight">Repurpose a document</h1>
        <p className="mt-1 text-muted">One piece of writing, a week of posts.</p>
      </header>

      <section className="glass mt-6 space-y-5 rounded-3xl p-5 sm:p-6">
        <div>
          <span className="font-medium">Document</span>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl ring-1 ring-line">
            {docs === null && <p className="p-4 text-center text-muted"><Loader2 className="mx-auto animate-spin" /></p>}
            {docs?.length === 0 && <p className="p-4 text-center text-sm text-muted">Write a document first, then come back.</p>}
            {docs?.map((d) => (
              <label key={d.id} className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-surface-strong ${selected === d.id ? "bg-surface-strong" : ""}`}>
                <input type="radio" name="doc" checked={selected === d.id} onChange={() => setSelected(d.id)} className="accent-[var(--accent)]" />
                <FileText size={15} className="text-muted" />
                <span className="min-w-0 flex-1 truncate">{d.title || "Untitled"}</span>
                <span className="shrink-0 text-xs text-muted">{d.word_count} words · {timeAgo(d.updated_at)}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="font-medium">Platforms</span>
          <div className="mt-2"><PlatformPicker value={platforms} onChange={setPlatforms} /></div>
        </div>
        <div>
          <span className="font-medium">Templates</span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full bg-surface-strong p-1">
              {(
                [
                  ["ai", "Let AI pick"],
                  ["choose", "Choose templates"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} onClick={() => setPickMode(id)} className={`rounded-full px-4 py-1 text-sm transition ${pickMode === id ? "bg-bg shadow-sm" : "text-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
            {pickMode === "ai" && (
              <>
                <span className="text-sm text-muted">Posts per platform</span>
                <div className="inline-flex rounded-full bg-surface-strong p-1">
                  {[1, 2, 3].map((n) => (
                    <button key={n} onClick={() => setPerPlatform(n)} className={`rounded-full px-3.5 py-1 text-sm transition ${perPlatform === n ? "bg-bg shadow-sm" : "text-muted"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}
            <span className="text-sm text-muted">{platforms.length * perPlatformCount} posts total</span>
          </div>

          {pickMode === "choose" && (
            <div className="mt-3 rounded-2xl p-3 ring-1 ring-line">
              <p className="px-1 text-xs text-muted">
                Pick up to {MAX_REPURPOSE_TEMPLATES}. Each one becomes a post on every platform.
                {picked.length === 0 && " Nothing picked yet, so the AI will choose."}
              </p>
              {picked.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {picked.map((k) => (
                    <span key={k} className="flex items-center gap-1 rounded-full bg-ink py-1 pr-1.5 pl-3 text-xs text-bg">
                      {choices.find((c) => c.key === k)?.name ?? "Template"}
                      <button onClick={() => togglePick(k)} aria-label="Remove template" className="rounded-full p-0.5 opacity-70 hover:opacity-100">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {CATEGORIES.filter((c) => c.id !== "mine" || mine.length).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${category === c.id ? "bg-surface-strong font-medium text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid max-h-64 gap-1.5 overflow-y-auto p-0.5 sm:grid-cols-2">
                {shown.map((c) => {
                  const on = picked.includes(c.key);
                  const full = !on && picked.length >= MAX_REPURPOSE_TEMPLATES;
                  return (
                    <button
                      key={c.key}
                      onClick={() => togglePick(c.key)}
                      disabled={full}
                      className={`flex items-start gap-2.5 rounded-xl px-3 py-2 text-left text-sm ring-1 transition disabled:opacity-40 ${on ? "bg-surface-strong ring-ink/40" : "ring-line enabled:hover:bg-surface-strong/60"}`}
                    >
                      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded ${on ? "bg-ink text-bg" : "ring-1 ring-line"}`}>{on && <Check size={11} />}</span>
                      <span className="min-w-0">
                        <span className="block font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted">{c.description || (c.category === "mine" ? "Your template" : "")}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div>
          <span className="font-medium">Style</span>
          <span className="ml-2 text-xs text-muted">Leave it to use the document’s style</span>
          <div className="mt-2"><StyleSelect value={styleId} onChange={setStyleId} /></div>
        </div>
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <button
          onClick={generate}
          disabled={!selected || !!loading}
          className="bg-gradient-brand flex items-center gap-2 rounded-full px-5 py-2.5 font-medium text-white shadow-md shadow-accent/20 transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <Layers size={17} /> {posts.length ? "Generate again" : `Turn ${current ? `“${current.title || "Untitled"}”` : "it"} into posts`}
        </button>
      </section>

      <Results supabase={supabase} posts={posts} setPosts={setPosts} loadingPlatforms={loading} extra={{ source_document_id: selected ?? null }} />
    </div>
  );
}
