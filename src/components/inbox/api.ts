"use client";

// Client data layer: typed fetch helpers + TanStack Query hooks for /api/inbox.

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { AccountRow, Address, ClassificationRow, FollowupRow, MessageRow, Preferences, SenderRow, TaskRow, WorkspaceRow } from "@/lib/inbox/types";
import type { BriefingContent } from "@/lib/inbox/briefing";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const r = await fetch(`/api/inbox${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const text = await r.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!r.ok) throw new ApiError(String(data.error ?? data.needsConfirmation ?? `Request failed (${r.status})`), r.status, data);
  return data as T;
}

export type Account = AccountRow & { capabilities: { read: boolean; search: boolean; modify: boolean; send: boolean } };
export interface Category {
  id: string;
  workspace_id: string;
  key: string;
  name: string;
  icon: string;
  position: number;
  system: boolean;
  hidden: boolean;
}
export interface Bootstrap {
  user: { email: string; local: boolean };
  prefs: Preferences;
  workspaces: (WorkspaceRow & { role: string })[];
  accounts: Account[];
  categories: Category[];
  entitlements: Record<string, { plan: string; label: string; features: string[]; maxAccounts: number }>;
  counts: { priority?: number; unread?: number; attention?: number; review?: number; i_owe?: number; they_owe?: number; tasks?: number; unread_by_category?: Record<string, number> };
  server: { gmail: boolean; gmailReason: string | null; outlook: boolean; billing: boolean; ai: { available: boolean; reason?: string; provider?: string }; simulatedAi: boolean; costEstimate: { perMonthUsd: number; assumptions: Record<string, number> } };
}

export type ListMessage = MessageRow & {
  c: (Pick<ClassificationRow, "importance" | "msg_type" | "action" | "time_sensitivity" | "category" | "priority_score" | "confidence" | "explanation" | "source" | "user_corrected" | "injection_flag">) | null;
  account_email: string;
  provider: string;
  vip: boolean;
  screening: string;
  blocked: boolean;
};

export interface MessageDetail {
  message: ListMessage & { body_source: "stored" | "provider" | "unavailable" };
  classification: ClassificationRow | null;
  thread: Pick<MessageRow, "id" | "from_email" | "from_name" | "to_addrs" | "subject" | "snippet" | "received_at" | "is_sent" | "signals">[];
  followups: FollowupRow[];
  tasks: TaskRow[];
  suggestions: Execution[];
  sender: SenderRow | null;
  drafts: Draft[];
  account: { id: string; email: string; provider: string; capabilities: Account["capabilities"] };
  webLink: string | null;
}

export interface Execution {
  id: string;
  workspace_id: string;
  rule_id: string | null;
  rule_name: string;
  message_id: string | null;
  action: { kind: string; value: string | null };
  status: "suggested" | "applied" | "approved" | "dismissed" | "undone" | "failed";
  provider_applied: boolean;
  undo: unknown;
  error: string | null;
  created_at: string;
  message?: { id: string; subject: string; from_email: string } | null;
}

export interface Draft {
  id: string;
  account_id: string;
  message_id: string | null;
  to_addrs: Address[];
  cc_addrs: Address[];
  bcc_addrs: Address[];
  subject: string;
  body: string;
  language: string;
  ai_generated: boolean;
  status: string;
  error: string | null;
}

export type FollowupItem = FollowupRow & { message: { id: string; subject: string; from_email: string; from_name: string; received_at: string } | null };

export interface BriefingRow {
  id: string;
  slot: string;
  created_at: string;
  summary_source: "deterministic" | "ai";
  model: string | null;
  content: BriefingContent;
}

export const qk = {
  boot: ["boot"] as QueryKey,
  messages: (ws: string, view: string, q: string, account: string) => ["messages", ws, view, q, account] as QueryKey,
  message: (id: string) => ["message", id] as QueryKey,
  followups: (ws: string, kind: string, status: string) => ["followups", ws, kind, status] as QueryKey,
  tasks: (ws: string, status: string) => ["tasks", ws, status] as QueryKey,
  briefing: (id?: string) => ["briefing", id ?? "latest"] as QueryKey,
};

export const useBoot = () => useQuery({ queryKey: qk.boot, queryFn: () => api<Bootstrap>("/bootstrap"), staleTime: 30_000 });

export function useMessages(ws: string, view: string, q = "", account = "") {
  return useQuery({
    queryKey: qk.messages(ws, view, q, account),
    queryFn: () => api<{ messages: ListMessage[] }>(`/messages?${new URLSearchParams({ ws, view, q, ...(account ? { account } : {}) })}`).then((r) => r.messages),
  });
}

export const useMessage = (id: string | null) => useQuery({ queryKey: qk.message(id ?? ""), queryFn: () => api<MessageDetail>(`/messages/${id}`), enabled: !!id });

export const useFollowups = (ws: string, kind = "", status = "open") =>
  useQuery({ queryKey: qk.followups(ws, kind, status), queryFn: () => api<{ followups: FollowupItem[] }>(`/followups?${new URLSearchParams({ ws, ...(kind ? { kind } : {}), status })}`).then((r) => r.followups) });

export const useTasks = (ws: string, status = "open") => useQuery({ queryKey: qk.tasks(ws, status), queryFn: () => api<{ tasks: TaskRow[] }>(`/tasks?${new URLSearchParams({ ws, status })}`).then((r) => r.tasks) });

export const useBriefing = (id?: string) => useQuery({ queryKey: qk.briefing(id), queryFn: () => api<{ briefing: BriefingRow | null; history: { id: string; slot: string; created_at: string; summary_source: string }[] }>(`/briefings${id ? `?id=${id}` : ""}`) });

/** Mutation that refreshes everything that might have changed afterwards. */
export function useAct<TArgs, TOut = unknown>(fn: (a: TArgs) => Promise<TOut>, opts: { onSuccess?: (out: TOut, args: TArgs) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (out, args) => {
      qc.invalidateQueries();
      opts.onSuccess?.(out, args);
    },
  });
}
