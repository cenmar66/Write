"use client";

import { CheckCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { PLATFORMS, type PlatformId } from "@/lib/social/platforms";
import { savePost } from "@/lib/social/save";
import type { createClient } from "@/lib/supabase/client";
import { type EditablePost, PostCard } from "./post-card";

/** Generated posts with per-post and "save all" saving. */
export function Results({
  supabase,
  posts,
  setPosts,
  loadingPlatforms,
  extra,
}: {
  supabase: ReturnType<typeof createClient>;
  posts: EditablePost[];
  setPosts: (fn: (p: EditablePost[]) => EditablePost[]) => void;
  loadingPlatforms: PlatformId[] | null;
  extra: { idea?: string; source_document_id?: string | null };
}) {
  const [saving, setSaving] = useState<Set<number>>(new Set());

  async function saveOne(i: number) {
    setSaving((s) => new Set(s).add(i));
    const id = await savePost(supabase, posts[i], { ...extra, template_key: posts[i].template });
    setPosts((ps) => ps.map((p, j) => (j === i ? { ...p, id: id ?? p.id, savedAt: id ? new Date().toISOString() : null } : p)));
    setSaving((s) => {
      const n = new Set(s);
      n.delete(i);
      return n;
    });
  }

  async function saveAll() {
    for (let i = 0; i < posts.length; i++) if (!posts[i].savedAt) await saveOne(i);
  }

  if (loadingPlatforms) {
    return (
      <section className="mt-6">
        <p className="flex items-center gap-2 text-sm text-accent">
          <Loader2 size={15} className="animate-spin" /> Writing for {loadingPlatforms.map((p) => PLATFORMS[p].label).join(", ")}… this takes 10 to 30 seconds.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {loadingPlatforms.map((p) => (
            <div key={p} className="glass h-72 animate-pulse rounded-3xl" />
          ))}
        </div>
      </section>
    );
  }
  if (!posts.length) return null;

  const allSaved = posts.every((p) => p.savedAt);
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl tracking-tight">Your posts</h2>
        <button
          onClick={saveAll}
          disabled={allSaved || saving.size > 0}
          className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50"
        >
          <CheckCheck size={15} /> {allSaved ? "All saved" : "Save all as drafts"}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {posts.map((post, i) => (
          <PostCard
            key={i}
            post={post}
            saving={saving.has(i)}
            onChange={(p) => setPosts((ps) => ps.map((x, j) => (j === i ? p : x)))}
            onSave={() => saveOne(i)}
            onRemove={() => setPosts((ps) => ps.filter((_, j) => j !== i))}
          />
        ))}
      </div>
    </section>
  );
}
