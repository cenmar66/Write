// Every mailbox action goes through a provider adapter. Adapters say what they can do
// (capabilities) and the server checks those, plus the user's automation mode, before
// calling anything that changes a mailbox.

import type { AccountRow, NormalizedMessage } from "../types";
import type { Db } from "../db";

export interface Capabilities {
  read: boolean;
  search: boolean;
  modify: boolean; // labels, archive, read state (never delete)
  send: boolean;
}

export interface ListPage {
  ids: { id: string; threadId: string }[];
  nextPageToken: string | null;
  /** Provider cursor to start incremental sync from after the initial import. */
  cursor: string | null;
  estimate?: number;
}

export type Changes = { expired: true } | { expired?: false; added: string[]; changed: string[]; removed: string[]; cursor: string };

export interface MailProvider {
  readonly id: AccountRow["provider"];
  capabilities(acc: AccountRow): Capabilities;
  listPage(acc: AccountRow, opts: { pageToken: string | null; maxResults: number; newerThanDays: number }): Promise<ListPage>;
  listChanges(acc: AccountRow, cursor: string): Promise<Changes>;
  getMessages(acc: AccountRow, ids: string[], opts: { format: "full" | "metadata" }): Promise<NormalizedMessage[]>;
  search(acc: AccountRow, query: string, max: number): Promise<string[]>;
  modify(acc: AccountRow, providerMessageId: string, change: { add?: string[]; remove?: string[] }): Promise<void>;
  ensureLabel(acc: AccountRow, name: string): Promise<string>;
  send(acc: AccountRow, raw: string, threadId: string | null): Promise<{ id: string; threadId: string }>;
  revoke(acc: AccountRow): Promise<void>;
  webLink(acc: AccountRow, m: { provider_thread_id: string; rfc_message_id: string | null }): string | null;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "rate_limit" | "not_found" | "permission" | "unavailable" | "not_implemented",
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface ProviderDeps {
  admin: Db | null; // service-role handle for tokens
}

export async function providerFor(acc: Pick<AccountRow, "provider">, deps: ProviderDeps): Promise<MailProvider> {
  if (acc.provider === "demo") return (await import("./demo")).demoProvider;
  if (acc.provider === "gmail") return (await import("./gmail")).gmailProvider(deps);
  return (await import("./outlook")).outlookProvider;
}
