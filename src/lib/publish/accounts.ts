import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";

// Server-only helpers for connected accounts. Tokens are decrypted only in memory.

export type AccountPlatform = "linkedin" | "facebook" | "instagram" | "threads" | "substack";

export type Account = {
  platform: AccountPlatform;
  userId: string;
  accountId: string;
  accountName: string;
  token: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  meta: Record<string, unknown>;
  status: "connected" | "error" | "expired";
};

/** A failure the user can fix by reconnecting the account. */
export class ReconnectError extends Error {}

export async function getAccount(supabase: SupabaseClient, platform: AccountPlatform, userId?: string): Promise<Account | null> {
  let q = supabase
    .from("connected_accounts")
    .select("user_id,platform,account_id,account_name,access_token_enc,refresh_token_enc,token_expires_at,meta,status")
    .eq("platform", platform);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return {
    platform,
    userId: data.user_id,
    accountId: data.account_id,
    accountName: data.account_name,
    token: data.access_token_enc ? decrypt(data.access_token_enc) : null,
    refreshToken: data.refresh_token_enc ? decrypt(data.refresh_token_enc) : null,
    expiresAt: data.token_expires_at,
    meta: (data.meta ?? {}) as Record<string, unknown>,
    status: data.status,
  };
}

export async function saveAccount(
  supabase: SupabaseClient,
  platform: AccountPlatform,
  fields: {
    userId: string;
    accountId: string;
    accountName: string;
    avatarUrl?: string | null;
    token?: string | null;
    refreshToken?: string | null;
    expiresInSeconds?: number | null;
    meta?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("connected_accounts").upsert(
    {
      user_id: fields.userId,
      platform,
      account_id: fields.accountId,
      account_name: fields.accountName,
      avatar_url: fields.avatarUrl ?? null,
      access_token_enc: fields.token ? encrypt(fields.token) : null,
      refresh_token_enc: fields.refreshToken ? encrypt(fields.refreshToken) : null,
      token_expires_at: fields.expiresInSeconds ? new Date(Date.now() + fields.expiresInSeconds * 1000).toISOString() : null,
      meta: fields.meta ?? {},
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform" },
  );
  if (error) throw new Error(`Couldn't save the ${platform} connection: ${error.message}`);
}

/** Stores a refreshed token without touching anything else. */
export async function updateToken(
  supabase: SupabaseClient,
  account: Account,
  token: string,
  expiresInSeconds: number | null,
  refreshToken?: string | null,
) {
  await supabase
    .from("connected_accounts")
    .update({
      access_token_enc: encrypt(token),
      ...(refreshToken ? { refresh_token_enc: encrypt(refreshToken) } : {}),
      token_expires_at: expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", account.userId)
    .eq("platform", account.platform);
}

export async function markAccount(supabase: SupabaseClient, account: Pick<Account, "userId" | "platform">, status: "error" | "expired", message: string) {
  await supabase
    .from("connected_accounts")
    .update({ status, last_error: message, updated_at: new Date().toISOString() })
    .eq("user_id", account.userId)
    .eq("platform", account.platform);
}

/** Reads a JSON response and turns API errors into readable messages. */
export async function readJson<T>(res: Response, platform: string): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const b = body as { error?: { message?: string } | string; message?: string; error_description?: string } | null;
    const detail =
      (typeof b?.error === "object" ? b.error?.message : b?.error) ?? b?.error_description ?? b?.message ?? `HTTP ${res.status}`;
    const message = `${platform}: ${detail}`;
    if (res.status === 401 || /expired|invalid.*token|session has been invalidated/i.test(String(detail))) {
      throw new ReconnectError(message);
    }
    throw new Error(message);
  }
  return body as T;
}
