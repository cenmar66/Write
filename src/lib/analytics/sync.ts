import type { SupabaseClient } from "@supabase/supabase-js";
import { freshAccount } from "@/lib/publish";
import { getAccount, markAccount, ReconnectError } from "@/lib/publish/accounts";
import { ANALYTICS_PLATFORMS, type AnalyticsPlatform, FETCHERS } from "./sources";

export type SyncResult = {
  platform: AnalyticsPlatform;
  status: "ok" | "not_connected" | "reconnect" | "error";
  items?: number;
  comments?: number;
  error?: string;
};

/** Messages that mean the account was connected before stats permissions were asked for. */
const MISSING_PERMISSION = /permission|scope|not authorized|\(#10\)|\(#200\)|requires .* access/i;

/** Pulls recent posts, numbers, comments and followers for every connected platform and stores them. */
export async function syncAnalytics(supabase: SupabaseClient, userId: string): Promise<SyncResult[]> {
  return Promise.all(ANALYTICS_PLATFORMS.map((p) => syncPlatform(supabase, userId, p)));
}

async function syncPlatform(supabase: SupabaseClient, userId: string, platform: AnalyticsPlatform): Promise<SyncResult> {
  const stored = await getAccount(supabase, platform, userId);
  if (!stored?.token) return { platform, status: "not_connected" };
  try {
    const account = await freshAccount(supabase, stored);
    const data = await FETCHERS[platform](account);
    const now = new Date().toISOString();

    // Match items to posts published from Write.ai.
    const ids = data.items.map((i) => i.externalId);
    const { data: ours } = ids.length
      ? await supabase.from("posts").select("id,external_id").eq("user_id", userId).eq("platform", platform).in("external_id", ids)
      : { data: [] };
    const postFor = new Map((ours ?? []).map((p) => [p.external_id as string, p.id as string]));

    let saved: { id: string; external_id: string }[] = [];
    if (data.items.length) {
      const { data: rows, error } = await supabase
        .from("social_items")
        .upsert(
          data.items.map((i) => ({
            user_id: userId,
            platform,
            external_id: i.externalId,
            post_id: postFor.get(i.externalId) ?? null,
            permalink: i.permalink,
            text: i.text,
            media_type: i.mediaType,
            posted_at: i.postedAt,
            ...i.metrics,
            metrics_at: now,
          })),
          { onConflict: "user_id,platform,external_id" },
        )
        .select("id,external_id");
      if (error) throw new Error(`Couldn't save ${platform} stats: ${error.message}`);
      saved = rows ?? [];
    }

    const itemId = new Map(saved.map((r) => [r.external_id, r.id]));
    const comments = data.items.flatMap((i) =>
      i.replies.map((c) => ({
        user_id: userId,
        item_id: itemId.get(i.externalId)!,
        platform,
        external_id: c.externalId,
        author: c.author,
        text: c.text,
        like_count: c.likeCount,
        posted_at: c.postedAt,
      })),
    ).filter((c) => c.item_id);
    if (comments.length) {
      const { error } = await supabase.from("social_comments").upsert(comments, { onConflict: "user_id,platform,external_id" });
      if (error) throw new Error(`Couldn't save ${platform} comments: ${error.message}`);
    }

    if (data.followers !== null) {
      await supabase
        .from("social_account_stats")
        .upsert({ user_id: userId, platform, day: now.slice(0, 10), followers: data.followers }, { onConflict: "user_id,platform,day" });
    }
    return { platform, status: "ok", items: data.items.length, comments: comments.length };
  } catch (e) {
    const message = (e as Error).message;
    if (e instanceof ReconnectError) {
      await markAccount(supabase, stored, "expired", message);
      return { platform, status: "reconnect", error: message };
    }
    if (MISSING_PERMISSION.test(message)) return { platform, status: "reconnect", error: message };
    return { platform, status: "error", error: message };
  }
}
