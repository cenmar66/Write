import type { SupabaseClient } from "@supabase/supabase-js";
import type { EditablePost } from "@/components/social/post-card";

/** Inserts or updates a post as a draft; returns its id. */
export async function savePost(
  supabase: SupabaseClient,
  post: EditablePost,
  extra: { idea?: string; template_key?: string; source_document_id?: string | null; folder_id?: string | null } = {},
): Promise<{ id: string } | { error: string }> {
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
    return error ? { error: error.message } : { id: post.id };
  }
  const { data, error } = await supabase
    .from("posts")
    .insert({ ...row, template_key: extra.template_key ?? post.template })
    .select("id")
    .single();
  return error || !data ? { error: error?.message ?? "No reply from the database." } : { id: data.id };
}
