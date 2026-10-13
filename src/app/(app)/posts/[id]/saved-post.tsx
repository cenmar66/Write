"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type EditablePost, PostCard } from "@/components/social/post-card";
import { savePost } from "@/lib/social/save";
import { createClient } from "@/lib/supabase/client";

export function SavedPost({ id }: { id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [post, setPost] = useState<EditablePost | null | "missing">(null);
  const [idea, setIdea] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("posts")
      .select("id,platform,format,content,parts,hashtags,template_key,idea,updated_at")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setPost("missing");
        setIdea(data.idea);
        setPost({
          id: data.id,
          platform: data.platform,
          format: data.format,
          content: data.content,
          parts: data.parts ?? [],
          hashtags: data.hashtags ?? [],
          template: data.template_key ?? "free",
          angle: "",
          savedAt: data.updated_at,
        });
      });
  }, [supabase, id]);

  if (post === null) return <div className="glass h-64 animate-pulse rounded-3xl" />;
  if (post === "missing")
    return (
      <p className="py-16 text-center text-muted">
        This post doesn’t exist. <Link href="/posts" className="text-accent">Back to posts</Link>
      </p>
    );

  return (
    <div className="mx-auto max-w-2xl animate-rise pb-8">
      <div className="flex items-center justify-between">
        <Link href="/posts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} /> Posts
        </Link>
        <button
          onClick={async () => {
            if (!confirm("Delete this draft?")) return;
            await supabase.from("posts").delete().eq("id", id);
            router.push("/posts");
          }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:text-rose-500"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      {idea && <p className="mt-4 text-sm text-muted">Idea: {idea}</p>}
      <div className="mt-4">
        <PostCard
          post={post}
          saving={saving}
          onChange={setPost}
          onSave={async () => {
            setSaving(true);
            const ok = await savePost(supabase, post);
            setPost({ ...post, savedAt: ok ? new Date().toISOString() : null });
            setSaving(false);
          }}
        />
      </div>
      <p className="mt-3 text-center text-xs text-muted">Scheduling and publishing arrive in Phase 6.</p>
    </div>
  );
}
