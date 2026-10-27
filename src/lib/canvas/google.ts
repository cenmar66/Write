// Server-only Google helpers for The Daily Canvas (Calendar + Tasks).
// Tokens are AES-GCM encrypted (lib/crypto) before they are stored, are never sent to
// the browser, and are refreshed here when they expire. If Google revokes access the
// account is marked as needing a reconnect instead of failing silently.

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";

export const SCOPES = {
  base: ["openid", "email"],
  calendar: [
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly", // list calendars to choose from
    "https://www.googleapis.com/auth/calendar.events", // read events; create/edit only when asked
  ],
  tasks: ["https://www.googleapis.com/auth/tasks"],
};

export function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export const redirectUri = (origin: string) => `${origin}/api/canvas/google/callback`;

export async function newState() {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("oauth_canvas_google", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return state;
}
export async function checkState(state: string | null) {
  const jar = await cookies();
  const expected = jar.get("oauth_canvas_google")?.value;
  jar.delete("oauth_canvas_google");
  return !!expected && expected === state;
}

export function authUrl(origin: string, scopes: string[], state: string, loginHint?: string | null) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: [...SCOPES.base, ...scopes].join(" "),
    access_type: "offline",
    include_granted_scopes: "true", // incremental: add Tasks later without losing Calendar
    prompt: "consent",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    cache: "no-store",
  });
  const json = (await r.json()) as TokenResponse;
  if (!r.ok) throw new GoogleAuthError(json.error ?? "token_error", json.error_description ?? `Google sign-in failed (${r.status}).`);
  return json;
}

export class GoogleAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function exchangeCode(code: string, origin: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
}

export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export interface GoogleAccountRow {
  user_id: string;
  google_email: string | null;
  scopes: string;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_expires_at: string | null;
  selected_calendars: string[];
  tasks_list_id: string | null;
  tasks_settings: Record<string, unknown>;
  last_calendar_sync: string | null;
  last_tasks_sync: string | null;
  last_error: string | null;
}

export async function getAccount(supabase: SupabaseClient): Promise<GoogleAccountRow | null> {
  const { data } = await supabase.from("canvas_google_accounts").select("*").maybeSingle();
  return (data as GoogleAccountRow | null) ?? null;
}

export async function saveTokens(supabase: SupabaseClient, userId: string, t: TokenResponse, prev: GoogleAccountRow | null) {
  const granted = new Set([...(prev?.scopes ?? "").split(" "), ...t.scope.split(" ")].filter(Boolean));
  const row = {
    user_id: userId,
    google_email: emailFromIdToken(t.id_token) ?? prev?.google_email ?? null,
    scopes: [...granted].join(" "),
    access_token_enc: encrypt(t.access_token),
    access_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    // Google only returns a refresh token on consent; keep the old one otherwise.
    refresh_token_enc: t.refresh_token ? encrypt(t.refresh_token) : prev?.refresh_token_enc ?? null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("canvas_google_accounts").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export const hasScope = (acc: GoogleAccountRow | null, scope: string) => !!acc?.scopes.split(" ").includes(scope);

/** A valid access token, refreshing it if needed. */
export async function accessToken(supabase: SupabaseClient, acc: GoogleAccountRow): Promise<string> {
  if (acc.access_token_enc && acc.access_expires_at && new Date(acc.access_expires_at) > new Date()) return decrypt(acc.access_token_enc);
  if (!acc.refresh_token_enc) throw new GoogleAuthError("no_refresh", "Google access has expired. Please reconnect in Settings.");
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(acc.refresh_token_enc) });
    await supabase
      .from("canvas_google_accounts")
      .update({ access_token_enc: encrypt(t.access_token), access_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), last_error: null })
      .eq("user_id", acc.user_id);
    return t.access_token;
  } catch (e) {
    if (e instanceof GoogleAuthError && e.code === "invalid_grant") {
      // Revoked or expired: forget the dead tokens and ask for a reconnect.
      await supabase
        .from("canvas_google_accounts")
        .update({ access_token_enc: null, refresh_token_enc: null, last_error: "Google access was revoked or expired. Reconnect in Settings." })
        .eq("user_id", acc.user_id);
      throw new GoogleAuthError("reconnect", "Google access was revoked or expired. Please reconnect in Settings.");
    }
    throw e;
  }
}

/** fetch() against a Google API with the account's token, retrying once after a 401. */
export async function gfetch<T>(supabase: SupabaseClient, acc: GoogleAccountRow, url: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  let token = await accessToken(supabase, acc);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (r.status === 401 && attempt === 0) {
      token = await accessToken(supabase, { ...acc, access_expires_at: null });
      continue;
    }
    const text = await r.text();
    const data = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string } };
    if (!r.ok && r.status !== 404 && r.status !== 409 && r.status !== 410) {
      throw new Error(data?.error?.message ?? `Google API error ${r.status}`);
    }
    return { status: r.status, data };
  }
  throw new Error("Google API authorization failed.");
}

export async function audit(supabase: SupabaseClient, provider: string, action: string, status: "ok" | "error" | "skipped", detail: Record<string, unknown> = {}) {
  await supabase.from("canvas_sync_audit").insert({ provider, action, status, detail });
}

// A tiny per-instance rate limit for the Google routes (best effort on serverless).
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max = 30, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
