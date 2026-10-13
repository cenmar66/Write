import type { SupabaseClient } from "@supabase/supabase-js";
import { countChars, fullText, PLATFORMS } from "@/lib/social/platforms";
import { type Account, type AccountPlatform, getAccount, markAccount, ReconnectError, updateToken } from "./accounts";
import { linkedinRefresh, publishLinkedIn } from "./linkedin";
import { publishFacebook, publishInstagram } from "./meta";
import { publishThreads, threadsRefresh } from "./threads";
import { AUTO_PLATFORMS, type PostRow, type PublishResult } from "./types";

const DAY = 86_400_000;

/** Refreshes tokens that expire soon (Threads every ~60 days, LinkedIn when a refresh token exists). */
async function freshAccount(supabase: SupabaseClient, account: Account): Promise<Account> {
  if (!account.expiresAt) return account;
  const left = new Date(account.expiresAt).getTime() - Date.now();
  if (left > 7 * DAY) return account;
  if (left <= 0 && !(account.platform === "linkedin" && account.refreshToken)) {
    throw new ReconnectError(`${account.platform}: the connection expired. Reconnect it in Settings.`);
  }
  if (account.platform === "threads") {
    const r = await threadsRefresh(account.token!);
    await updateToken(supabase, account, r.access_token, r.expires_in);
    return { ...account, token: r.access_token };
  }
  if (account.platform === "linkedin" && account.refreshToken) {
    const r = await linkedinRefresh(account.refreshToken);
    await updateToken(supabase, account, r.access_token, r.expires_in, r.refresh_token);
    return { ...account, token: r.access_token };
  }
  return account;
}

function checkLimits(post: PostRow) {
  const limit = PLATFORMS[post.platform].limit;
  if (post.format === "thread") {
    const bad = post.parts.findIndex((p) => countChars(post.platform, p) > limit);
    if (bad >= 0) throw new Error(`Post ${bad + 1} of the thread is over ${limit} characters.`);
  } else if (countChars(post.platform, fullText(post.platform, post.content, post.hashtags)) > limit) {
    throw new Error(`The post is over ${PLATFORMS[post.platform].label}'s ${limit.toLocaleString()}-character limit.`);
  }
}

/** Sends one post to its platform. Throws with a readable message on failure. */
export async function publishPost(supabase: SupabaseClient, post: PostRow): Promise<PublishResult> {
  if (!AUTO_PLATFORMS.includes(post.platform)) throw new Error(`${PLATFORMS[post.platform].label} posts are shared by hand (copy + open).`);
  checkLimits(post);
  const platform = post.platform as AccountPlatform;
  const stored = await getAccount(supabase, platform, post.user_id);
  if (!stored?.token) throw new Error(`Connect ${PLATFORMS[post.platform].label} in Settings first.`);
  try {
    const account = await freshAccount(supabase, stored);
    switch (post.platform) {
      case "linkedin":
        return await publishLinkedIn(account, post);
      case "facebook":
        return await publishFacebook(account, post);
      case "instagram":
        return await publishInstagram(account, post);
      case "threads":
        return await publishThreads(account, post);
    }
  } catch (error) {
    if (error instanceof ReconnectError) await markAccount(supabase, stored, "expired", error.message);
    throw error;
  }
  throw new Error("Unsupported platform.");
}

/**
 * Claims a post (so it can't be sent twice), publishes it, and records the outcome.
 * Works with the signed-in client (Post now) and the admin client (scheduler).
 */
export async function claimAndPublish(supabase: SupabaseClient, postId: string, from: string[]): Promise<{ ok: boolean; url?: string | null; error?: string }> {
  const { data: claimed } = await supabase
    .from("posts")
    .update({ status: "publishing", error: null, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .in("status", from)
    .select("id,user_id,platform,format,content,parts,hashtags,media,status,scheduled_at")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "This post is already being published or was changed." };

  try {
    const result = await publishPost(supabase, claimed as PostRow);
    await supabase
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString(), external_url: result.url, error: null, updated_at: new Date().toISOString() })
      .eq("id", postId);
    return { ok: true, url: result.url };
  } catch (e) {
    const message = (e as Error).message || "Publishing failed.";
    await supabase.from("posts").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", postId);
    return { ok: false, error: message };
  }
}
