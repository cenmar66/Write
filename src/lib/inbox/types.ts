// Shared InboxPilot types. Row shapes mirror supabase/migrations/0011_inboxpilot.sql.

export type AutomationMode = "observe" | "assisted" | "automatic";
export type AiContentMode = "metadata" | "snippet" | "full";
export type Importance = "critical" | "high" | "normal" | "low";
export type MsgType =
  | "client" | "prospect" | "vendor" | "team" | "family" | "financial" | "administrative"
  | "newsletter" | "marketing" | "notification" | "transactional" | "other";
export type ActionKind = "reply_needed" | "task_required" | "review_needed" | "waiting" | "informational" | "no_action";
export type TimeSensitivity = "immediate" | "today" | "this_week" | "flexible" | "unknown";

export const IMPORTANCE: Importance[] = ["critical", "high", "normal", "low"];
export const MSG_TYPES: MsgType[] = [
  "client", "prospect", "vendor", "team", "family", "financial", "administrative",
  "newsletter", "marketing", "notification", "transactional", "other",
];
export const ACTIONS: ActionKind[] = ["reply_needed", "task_required", "review_needed", "waiting", "informational", "no_action"];
export const TIME_SENS: TimeSensitivity[] = ["immediate", "today", "this_week", "flexible", "unknown"];

export interface Address {
  email: string;
  name: string;
}

export interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
}

/** Header-derived facts about a message, computed once at sync time. */
export interface Signals {
  bulk?: boolean;          // Precedence: bulk/list, or List-Id present
  noreply?: boolean;       // from no-reply style address
  autoReply?: boolean;     // Auto-Submitted / X-Autoreply / out-of-office subject
  dsn?: boolean;           // delivery status notification / bounce
  calendar?: boolean;      // invitation
  spamLabel?: boolean;     // Gmail put it in spam
  gmailCategory?: string;  // CATEGORY_PROMOTIONS etc.
  suspicious?: string[];   // warnings (display-name spoofing, reply-to mismatch...)
}

/** A message normalized from any provider (Gmail, demo, later Outlook). */
export interface NormalizedMessage {
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  from: Address;
  to: Address[];
  cc: Address[];
  replyTo: string | null;
  subject: string;
  snippet: string;
  bodyText: string | null;
  receivedAt: string; // ISO
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  isSent: boolean;
  inInbox: boolean;
  attachments: Attachment[];
  listId: string | null;
  listUnsubscribe: string | null;
  autoSubmitted: string | null;
  precedence: string | null;
  signals: Signals;
}

export interface MessageRow {
  id: string;
  workspace_id: string;
  account_id: string;
  thread_id: string | null;
  provider_message_id: string;
  provider_thread_id: string;
  rfc_message_id: string | null;
  in_reply_to: string | null;
  from_email: string;
  from_name: string;
  to_addrs: Address[];
  cc_addrs: Address[];
  reply_to: string | null;
  subject: string;
  snippet: string;
  body_text: string | null;
  body_expires_at: string | null;
  received_at: string;
  label_ids: string[];
  is_unread: boolean;
  is_starred: boolean;
  is_sent: boolean;
  in_inbox: boolean;
  has_attachments: boolean;
  attachments: Attachment[];
  list_id: string | null;
  list_unsubscribe: string | null;
  auto_submitted: string | null;
  precedence: string | null;
  signals: Signals;
  category: string | null;
  importance?: string | null;
  priority_score?: number;
  snoozed_until: string | null;
  snooze_until_reply: boolean;
  done_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Factor {
  label: string;
  weight: number; // contribution to priority, can be negative
  source: "sender" | "vip" | "headers" | "content" | "rule" | "feedback" | "ai" | "thread" | "deadline";
}

export interface Classification {
  importance: Importance;
  msg_type: MsgType;
  action: ActionKind;
  time_sensitivity: TimeSensitivity;
  category: string;
  priority_score: number;
  confidence: number;
  explanation: string;
  factors: Factor[];
  source: "rules" | "heuristic" | "ai" | "user";
  model?: string | null;
  injection_flag?: boolean;
}

export interface ClassificationRow extends Classification {
  message_id: string;
  workspace_id: string;
  user_corrected: boolean;
  created_at?: string;
}

export interface SenderRow {
  id: string;
  workspace_id: string;
  email: string;
  domain: string;
  display_name: string;
  is_vip: boolean;
  always_priority: boolean;
  suppress_notifications: boolean;
  screening: "unknown" | "approved" | "screened_out";
  default_category: string | null;
  blocked: boolean;
  received_count: number;
  replied_count: number;
  sent_to_count: number;
  first_seen: string | null;
  last_seen: string | null;
}

export interface AccountRow {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: "gmail" | "outlook" | "demo";
  email: string;
  display_name: string | null;
  status: "active" | "syncing" | "needs_reconnect" | "paused" | "error";
  scopes: string;
  sync_cursor: string | null;
  sync_state: { phase?: "initial" | "incremental" | "done"; pageToken?: string | null; fetched?: number; target?: number; startedAt?: string };
  last_sync_at: string | null;
  last_error: string | null;
  automation_mode: AutomationMode | null;
  settings: { label_sync?: boolean; ai_content?: AiContentMode | null };
  created_at: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  kind: "personal" | "business" | "team";
  owner_id: string;
  is_demo: boolean;
  color: string;
  created_at: string;
}

export interface BriefingPrefs {
  morning: string | null;
  midday: string | null;
  evening: string | null;
  mode: "concise" | "expanded";
  channels: string[];
}

export interface FocusPrefs {
  enabled: boolean;
  windows: { days: number[]; start: string; end: string }[];
  allow_vip: boolean;
  allow_critical: boolean;
}

export interface WritingProfile {
  tone?: string;
  greeting?: string;
  closing?: string;
  formality?: "casual" | "neutral" | "formal";
  conciseness?: "brief" | "balanced" | "detailed";
  language?: string; // "en" | "es" | ...
  instructions?: string;
  signature?: string;
}

export interface Preferences {
  user_id: string;
  timezone: string;
  automation_mode: AutomationMode;
  ai_content: AiContentMode;
  ai_external: boolean;
  ai_provider: "anthropic" | "openai";
  ai_drafts: boolean;
  ai_monthly_request_cap: number;
  body_retention_days: number;
  briefing: BriefingPrefs;
  focus: FocusPrefs;
  followup_days: number;
  writing_profile: WritingProfile;
  learn_from_sent: boolean;
  onboarding: Record<string, unknown>;
  ui: Record<string, unknown>;
}

export const DEFAULT_PREFERENCES: Omit<Preferences, "user_id"> = {
  timezone: "America/Los_Angeles",
  automation_mode: "observe",
  ai_content: "metadata",
  ai_external: false,
  ai_provider: "anthropic",
  ai_drafts: true,
  ai_monthly_request_cap: 2000,
  body_retention_days: 14,
  briefing: { morning: "08:00", midday: null, evening: null, mode: "concise", channels: ["in_app"] },
  focus: { enabled: false, windows: [], allow_vip: true, allow_critical: true },
  followup_days: 3,
  writing_profile: {},
  learn_from_sent: false,
  onboarding: {},
  ui: {},
};

export interface TaskRow {
  id: string;
  workspace_id: string;
  account_id: string | null;
  message_id: string | null;
  source_ref: SourceRef | null;
  title: string;
  description: string;
  due_date: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  project: string | null;
  assignee: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  notes: string;
  provenance: Record<string, "explicit" | "inferred" | "user">;
  external_refs: Record<string, string>;
  dedupe_key: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRef {
  provider: string;
  provider_message_id: string;
  provider_thread_id: string;
  account_email: string;
  subject: string;
  from: string;
}

export type FollowupKind = "i_owe" | "they_owe" | "commitment";

export interface FollowupRow {
  id: string;
  workspace_id: string;
  account_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  kind: FollowupKind;
  title: string;
  counterpart: string;
  due_at: string | null;
  due_explicit: boolean;
  evidence: string;
  confidence: number;
  detected_by: "rule" | "ai" | "user";
  status: "open" | "done" | "snoozed" | "dismissed";
  snoozed_until: string | null;
  tracking_disabled: boolean;
  assignee: string | null;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
}

export interface DraftRow {
  id: string;
  workspace_id: string;
  account_id: string;
  message_id: string | null;
  provider_thread_id: string | null;
  to_addrs: Address[];
  cc_addrs: Address[];
  bcc_addrs: Address[];
  subject: string;
  body: string;
  language: string;
  ai_generated: boolean;
  status: "draft" | "sending" | "sent" | "discarded" | "failed";
  sent_at: string | null;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
}
