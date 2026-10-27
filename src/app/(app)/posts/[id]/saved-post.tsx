"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type EditablePost, PostCard } from "@/components/social/post-card";
import { PublishPanel, type PublishState } from "@/components/social/publish-panel";
import { savePost } from "@/lib/social/save";
import { createClient } from "@/lib/supabase/client";

export function SavedPost({ id }: { id: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [post, setPost] = useState<EditablePost | null | "missing">(null);
  const [state, setState] = useState<PublishState | null>(null);
  const [idea, setIdea] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("posts")
      .select("id,platform,format,content,parts,hashtags,template_key,idea,updated_at,media,status,scheduled_at,published_at,external_url,error")
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
        setState({
          id: data.id,
          platform: data.platform,
          format: data.format,
          content: data.content,
          parts: data.parts ?? [],
          hashtags: data.hashtags ?? [],
          media: data.media ?? [],
          status: data.status,
          scheduled_at: data.scheduled_at,
          published_at: data.published_at,
          external_url: data.external_url,
          error: data.error,
        });
      });
  }, [supabase, id]);

  if (post === null || (post !== "missing" && !state)) return <div className="glass h-64 animate-pulse rounded-3xl" />;
  if (post === "missing")
    return (
      <p className="py-16 text-center text-muted">
        This post doesn’t exist. <Link href="/posts" className="text-accent">Back to posts</Link>
      </p>
    );

  async function save(): Promise<boolean> {
    if (post === null || post === "missing") return false;
    if (post.savedAt) return true;
    setSaving(true);
    const ok = await savePost(supabase, post);
    setPost({ ...post, savedAt: ok ? new Date().toISOString() : null });
    setSaving(false);
    return !!ok;
  }

  const live = { ...state!, content: post.content, parts: post.parts, hashtags: post.hashtags };
  const locked = state!.status === "published" || state!.status === "publishing";

  return (
    <div className="mx-auto max-w-2xl animate-rise pb-8">
      <div className="flex items-center justify-between">
        <Link href="/posts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} /> Posts
        </Link>
        <button
          onClick={async () => {
            if (!confirm(state!.status === "published" ? "Remove this post from your list? (It stays on the platform.)" : "Delete this post?")) return;
            await supabase.from("posts").delete().eq("id", id);
            router.push("/posts");
          }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:text-red-700 dark:hover:text-red-400"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      {idea && <p className="mt-4 text-sm text-muted">Idea: {idea}</p>}
      <div className={`mt-4 ${locked ? "pointer-events-none opacity-80" : ""}`}>
        <PostCard post={post} saving={saving} onChange={setPost} onSave={locked ? undefined : save} />
      </div>
      <PublishPanel post={live} dirty={!post.savedAt} saveContent={save} onUpdated={(patch) => setState((s) => (s ? { ...s, ...patch } : s))} />
    </div>
  );
}
