import type { SupabaseClient } from "@supabase/supabase-js";
import type { EditablePost } from "@/components/social/post-card";

/** Inserts or updates a post as a draft; returns its id. */
export async function savePost(
  supabase: SupabaseClient,
  post: EditablePost,
  extra: { idea?: string; template_key?: string; source_document_id?: string | null } = {},
): Promise<string | null> {
  const row = {
    platform: post.platform,
    format: post.format,
    content: post.content,
    parts: post.parts,
    hashtags: post.hashtags,
    updated_at: new Date().toISOString(),
    ...extra,
  };
  if (post.id) {
    const { error } = await supabase.from("posts").update(row).eq("id", post.id);
    return error ? null : post.id;
  }
  const { data, error } = await supabase
    .from("posts")
    .insert({ ...row, template_key: extra.template_key ?? post.template })
    .select("id")
    .single();
  return error || !data ? null : data.id;
}
