"use client";

import { ArrowLeft, FileText, Layers, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditablePost } from "@/components/social/post-card";
import { PlatformPicker } from "@/components/social/platform-picker";
import { Results } from "@/components/social/results";
import { timeAgo } from "@/lib/docs";
import type { GeneratedPost } from "@/lib/social/ai";
import { PLATFORM_IDS, type PlatformId } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/client";

type DocRow = { id: string; title: string; word_count: number; updated_at: string };

export function Repurposer({ docId, auto }: { docId?: string; auto: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [selected, setSelected] = useState<string | undefined>(docId);
  const [platforms, setPlatforms] = useState<PlatformId[]>(PLATFORM_IDS);
  const [perPlatform, setPerPlatform] = useState(1);
  const [posts, setPosts] = useState<EditablePost[]>([]);
  const [loading, setLoading] = useState<PlatformId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    supabase
      .from("documents")
      .select("id,title,word_count,updated_at")
      .gt("word_count", 0)
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
        body: JSON.stringify({ mode: "repurpose", documentId: selected, platforms, perPlatform }),
      });
      const body = (await res.json()) as { posts?: GeneratedPost[]; error?: string };
      if (!body.posts) throw new Error(body.error);
      setPosts(body.posts);
    } catch (e) {
      setError((e as Error).message || "Repurposing failed. Try again.");
    }
    setLoading(null);
  }, [selected, platforms, perPlatform]);

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
          <span className="font-medium">Posts per platform</span>
          <div className="mt-2 inline-flex rounded-full bg-surface-strong p-1">
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => setPerPlatform(n)} className={`rounded-full px-4 py-1 text-sm transition ${perPlatform === n ? "bg-bg shadow-sm" : "text-muted"}`}>
                {n}
              </button>
            ))}
          </div>
          <span className="ml-3 text-sm text-muted">{platforms.length * perPlatform} posts total</span>
        </div>
        {error && <p className="text-sm text-rose-500">{error}</p>}
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
