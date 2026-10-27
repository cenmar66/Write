"use client";

import { ArrowLeft, Loader2, Mic, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DictationPanel } from "@/components/dictation/dictation-panel";
import type { EditablePost } from "@/components/social/post-card";
import { PlatformPicker } from "@/components/social/platform-picker";
import { Results } from "@/components/social/results";
import { StyleSelect } from "@/components/style-select";
import type { GeneratedPost } from "@/lib/social/ai";
import type { PlatformId, PostFormat } from "@/lib/social/platforms";
import { baseOutline, type Outline, outlineBrief } from "@/lib/social/outlines";
import { findPrompt, PROMPT_FORMATS, type TopicPrompt, type UserPack } from "@/lib/social/prompts";
import { FREE_WRITE, findTemplate, type PostTemplate } from "@/lib/social/templates";
import { createClient } from "@/lib/supabase/client";

export function Composer({ templateKey, customId, promptKey }: { templateKey: string; customId?: string; promptKey?: string }) {
  const supabase = useMemo(() => createClient(), []);
  // Built-in prompts are known right away; your own packs ("my:<packId>:<index>") load from the database.
  const [topic, setTopic] = useState<TopicPrompt | undefined>(() => findPrompt(promptKey));
  const builtIn = customId ? undefined : (findTemplate(topic ? PROMPT_FORMATS[topic.format].template : templateKey) ?? FREE_WRITE);
  const [template, setTemplate] = useState<PostTemplate | null>(builtIn ?? null);
  const [idea, setIdea] = useState("");
  // Outline for prompts: a base skeleton shows at once, then the AI tailors it to the prompt.
  const [outline, setOutline] = useState<Outline | null>(() => (topic ? baseOutline(topic.title, topic.prompt, topic.format) : null));
  const [notes, setNotes] = useState<string[]>([]);
  const [tailoring, setTailoring] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformId[]>(topic ? PROMPT_FORMATS[topic.format].platforms : builtIn ? builtIn.bestFor.slice(0, 3) : ["linkedin"]);
  const [posts, setPosts] = useState<EditablePost[]>([]);
  const [loading, setLoading] = useState<PlatformId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [styleId, setStyleId] = useState<string | null>(null);

  useEffect(() => {
    const m = promptKey?.match(/^my:([0-9a-f-]+):(\d+)$/);
    if (!m) return;
    supabase
      .from("prompt_packs")
      .select("id,name,emoji,description,prompts,created_at")
      .eq("id", m[1])
      .maybeSingle()
      .then(({ data }) => {
        const pack = data as UserPack | null;
        const p = pack?.prompts[Number(m[2])];
        if (!pack || !p) return;
        setTopic({ ...p, key: promptKey!, theme: pack.name });
        setTemplate(findTemplate(PROMPT_FORMATS[p.format]?.template) ?? FREE_WRITE);
        setPlatforms(PROMPT_FORMATS[p.format]?.platforms ?? ["linkedin"]);
      });
  }, [promptKey, supabase]);

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

  const tailor = useCallback(async (t: TopicPrompt) => {
    setTailoring(true);
    try {
      const res = await fetch("/api/ai/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t.title, prompt: t.prompt, format: t.format }),
      });
      const body = (await res.json()) as { outline?: Outline };
      if (body.outline) setOutline(body.outline);
    } catch {
      // Keep the base outline.
    }
    setTailoring(false);
  }, []);

  useEffect(() => {
    if (!topic) return;
    queueMicrotask(() => {
      setOutline((o) => o ?? baseOutline(topic.title, topic.prompt, topic.format));
      tailor(topic);
    });
  }, [topic, tailor]);

  const editStep = (i: number, patch: Partial<Outline["steps"][number]>) =>
    setOutline((o) => (o ? { ...o, steps: o.steps.map((st, j) => (j === i ? { ...st, ...patch } : st)) } : o));
  const removeStep = (i: number) => {
    setOutline((o) => (o ? { ...o, steps: o.steps.filter((_, j) => j !== i) } : o));
    // Fill gaps first: empty steps leave holes in the array, and filter() would skip them and shift notes.
    setNotes((n) => Array.from({ length: Math.max(n.length, i + 1) }, (_, j) => n[j] ?? "").filter((_, j) => j !== i));
  };
  const hasNotes = notes.some((n) => n.trim());

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
          idea: topic
            ? [
                `Writing prompt: ${topic.title}. ${topic.prompt}`,
                outline ? outlineBrief(outline, notes) : "",
                idea.trim() ? `More notes and experience:\n${idea}` : "",
              ]
                .filter(Boolean)
                .join("\n\n")
            : idea,
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
        <h1 className="font-display text-4xl tracking-tight">{topic ? topic.title : (template?.name ?? "Loading…")}</h1>
        {topic ? (
          <p className="mt-2 max-w-2xl rounded-2xl bg-surface-strong px-4 py-3 text-ink/90">
            <span className="mr-2 grayscale" aria-hidden>{topic.emoji}</span>
            {topic.prompt}
            <span className="mt-1 block text-xs text-muted">Format: {PROMPT_FORMATS[topic.format].label}{template ? ` · uses the “${template.name}” template` : ""}</span>
          </p>
        ) : (
          template && <p className="mt-1 text-muted">{template.description}</p>
        )}
      </header>

      {topic && outline && (
        <section className="glass mt-6 rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">Outline</h2>
            <span className="rounded-full bg-surface-strong px-2.5 py-0.5 text-xs text-muted">about {outline.targetWords} words</span>
            {tailoring && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Loader2 size={12} className="animate-spin" /> Tailoring to this prompt…
              </span>
            )}
            <button onClick={() => tailor(topic)} disabled={tailoring} className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted ring-1 ring-line hover:text-ink disabled:opacity-50">
              <RefreshCw size={12} /> New outline
            </button>
          </div>
          <p className="mt-1 text-sm text-muted">Jot a few words for each step, or skip any. The AI follows this shape.</p>
          <ol className="mt-4 space-y-3">
            {outline.steps.map((st, i) => (
              <li key={i} className="rounded-2xl bg-bg p-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-strong text-xs font-medium">{i + 1}</span>
                  <input
                    value={st.label}
                    onChange={(e) => editStep(i, { label: e.target.value })}
                    aria-label={`Step ${i + 1} name`}
                    className="min-w-0 flex-1 bg-transparent font-medium outline-none"
                  />
                  <button onClick={() => removeStep(i)} aria-label={`Remove step ${i + 1}`} className="rounded-full p-1 text-muted hover:text-red-700 dark:hover:text-red-400">
                    <X size={14} />
                  </button>
                </div>
                <p className="mt-1 pl-8 text-sm text-muted">{st.hint}</p>
                <textarea
                  value={notes[i] ?? ""}
                  onChange={(e) => setNotes((n) => {
                    const next = [...n];
                    next[i] = e.target.value;
                    return next;
                  })}
                  rows={1}
                  placeholder="Your notes…"
                  aria-label={`Notes for ${st.label}`}
                  className="mt-2 ml-8 block w-[calc(100%-2rem)] resize-none rounded-xl bg-surface px-3 py-2 text-[15px] outline-none [field-sizing:content] placeholder:text-muted"
                />
              </li>
            ))}
          </ol>
          <button
            onClick={() => setOutline((o) => (o ? { ...o, steps: [...o.steps, { label: "New step", hint: "Anything else you want the post to include." }] } : o))}
            className="mt-2 flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:text-ink"
          >
            <Plus size={13} /> Add step
          </button>
        </section>
      )}

      <section className="glass mt-6 space-y-4 rounded-3xl p-5 sm:p-6">
        <label className="block">
          <span className="font-medium">{topic ? (outline ? "Anything else? (optional)" : "Your answer") : "What’s your idea?"}</span>
          <div className="relative mt-2">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
              placeholder={topic ? (outline ? "Anything the outline missed: a story, a detail, a link. Optional." : "Jot your honest answer: examples, numbers, a quick story. Rough notes are fine.") : "A rough thought, a story, a lesson, notes from a meeting… English or Spanish."}
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
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <button
          onClick={draft}
          disabled={!(idea.trim() || hasNotes) || !template || !!loading}
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
