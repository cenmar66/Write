// Request context for InboxPilot server code: who is signed in, and which database
// handle to use. Production: the user's Supabase session (row-level security applies)
// plus a service-role handle used ONLY for encrypted provider tokens and the scheduler.
// Local demo (development only): an in-memory database with a fake owner.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAllowed } from "@/lib/env";
import { MemoryDb } from "./memory-db";

export type Db = SupabaseClient;

export interface InboxCtx {
  db: Db;
  /** Service-role client (bypasses RLS). Only for ip_provider_tokens and background jobs. */
  admin: Db | null;
  userId: string;
  email: string;
  local: boolean;
}

/** Local demo mode: dev builds only, whatever the variable says in production. */
export function localDemo(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.INBOX_LOCAL_DEMO === "1";
}

const LOCAL_USER = { id: "00000000-0000-4000-8000-00000000ab01", email: "owner@example.com" };

export function memoryDb(): MemoryDb {
  const g = globalThis as unknown as { __inboxMemoryDb?: MemoryDb };
  g.__inboxMemoryDb ??= new MemoryDb(LOCAL_USER);
  return g.__inboxMemoryDb;
}

export async function inboxContext(): Promise<InboxCtx | { denied: Response }> {
  if (localDemo()) {
    const db = memoryDb() as unknown as Db;
    return { db, admin: db, userId: LOCAL_USER.id, email: LOCAL_USER.email, local: true };
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  const userId = data?.claims?.sub as string | undefined;
  if (!userId || !isAllowed(email)) return { denied: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  let admin: Db | null = null;
  if (process.env.SUPABASE_SECRET_KEY) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    admin = createAdminClient();
  }
  return { db: supabase, admin, userId, email: email!, local: false };
}

/** Throws a readable error for a failed Supabase call. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
