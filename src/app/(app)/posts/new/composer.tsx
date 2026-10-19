"use client";

import { ArrowLeft, Mic, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DictationPanel } from "@/components/dictation/dictation-panel";
import type { EditablePost } from "@/components/social/post-card";
import { PlatformPicker } from "@/components/social/platform-picker";
import { Results } from "@/components/social/results";
import { StyleSelect } from "@/components/style-select";
import type { GeneratedPost } from "@/lib/social/ai";
import type { PlatformId, PostFormat } from "@/lib/social/platforms";
import { FREE_WRITE, findTemplate, type PostTemplate } from "@/lib/social/templates";
import { createClient } from "@/lib/supabase/client";

export function Composer({ templateKey, customId }: { templateKey: string; customId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const builtIn = customId ? undefined : (findTemplate(templateKey) ?? FREE_WRITE);
  const [template, setTemplate] = useState<PostTemplate | null>(builtIn ?? null);
  const [idea, setIdea] = useState("");
  const [platforms, setPlatforms] = useState<PlatformId[]>(builtIn ? builtIn.bestFor.slice(0, 3) : ["linkedin"]);
  const [posts, setPosts] = useState<EditablePost[]>([]);
  const [loading, setLoading] = useState<PlatformId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [styleId, setStyleId] = useState<string | null>(null);

  useEffect(() => {
    if (!customId) return;
    supabase
      .from("post_templates")
      .select("id,name,description,structure,example,format")
      .eq("id", customId)
      .maybeSingle()
      .then(({ data }) => {
        if (data)
          setTemplate({
            key: `custom:${data.id}`,
            name: data.name,
            category: "mine",
            description: data.description,
            structure: data.structure,
            example: data.example,
            format: data.format as PostFormat,
            bestFor: ["linkedin", "x", "threads", "facebook", "instagram"],
          });
      });
  }, [customId, supabase]);

  async function draft() {
    if (!template) return;
    setError(null);
    setPosts([]);
    setLoading(platforms);
    try {
      const res = await fetch("/api/ai/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "draft",
          idea,
          platforms,
          styleId,
          ...(template.category === "mine"
            ? { customTemplate: { name: template.name, structure: template.structure, example: template.example, format: template.format } }
            : { templateKey: template.key }),
        }),
      });
      const body = (await res.json()) as { posts?: GeneratedPost[]; error?: string };
      if (!body.posts) throw new Error(body.error);
      setPosts(body.posts);
    } catch (e) {
      setError((e as Error).message || "Drafting failed. Try again.");
    }
    setLoading(null);
  }

  return (
    <div className="animate-rise pb-8">
      <Link href="/posts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Templates
      </Link>
      <header className="mt-3">
        <h1 className="font-display text-4xl tracking-tight">{template?.name ?? "Loading…"}</h1>
        {template && <p className="mt-1 text-muted">{template.description}</p>}
      </header>

      <section className="glass mt-6 space-y-4 rounded-3xl p-5 sm:p-6">
        <label className="block">
          <span className="font-medium">What’s your idea?</span>
          <div className="relative mt-2">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
              placeholder="A rough thought, a story, a lesson, notes from a meeting… English or Spanish."
              className="w-full resize-y rounded-2xl bg-bg px-4 py-3 pr-14 leading-relaxed ring-1 ring-line outline-none [field-sizing:content] focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={() => setDictating(true)}
              aria-label="Dictate your idea"
              className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-ink text-bg transition hover:scale-105"
            >
              <Mic size={16} />
            </button>
          </div>
        </label>
        <div>
          <span className="font-medium">Where will it go?</span>
          <div className="mt-2">
            <PlatformPicker value={platforms} onChange={setPlatforms} />
          </div>
        </div>
        <div>
          <span className="font-medium">In which style?</span>
          <div className="mt-2">
            <StyleSelect value={styleId} onChange={setStyleId} />
          </div>
        </div>
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button
          onClick={draft}
          disabled={!idea.trim() || !template || !!loading}
          className="bg-gradient-brand flex items-center gap-2 rounded-full px-5 py-2.5 font-medium text-white shadow-md shadow-accent/20 transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <Sparkles size={17} /> {posts.length ? "Draft again" : "Draft my posts"}
        </button>
      </section>

      <Results supabase={supabase} posts={posts} setPosts={setPosts} loadingPlatforms={loading} extra={{ idea }} />

      {dictating && (
        <DictationPanel
          startNow
          onInsert={(text) => setIdea((i) => (i.trim() ? `${i.trimEnd()}\n\n${text}` : text))}
          onCommand={() => setError("Voice commands work in documents. Here, just say your idea.")}
          onClose={() => setDictating(false)}
        />
      )}
    </div>
  );
}
