import type { MessageRow } from "@/lib/inbox/types";

let n = 0;
export function msg(over: Partial<MessageRow> = {}): MessageRow {
  n++;
  return {
    id: over.id ?? `m${n}`,
    workspace_id: "ws1",
    account_id: "acc1",
    thread_id: "th1",
    provider_message_id: `p${n}`,
    provider_thread_id: "pt1",
    rfc_message_id: null,
    in_reply_to: null,
    from_email: "client@acme.test",
    from_name: "Client",
    to_addrs: [{ email: "me@x.test", name: "Me" }],
    cc_addrs: [],
    reply_to: null,
    subject: "Hello",
    snippet: "",
    body_text: "",
    body_expires_at: null,
    received_at: "2026-10-28T16:00:00.000Z",
    label_ids: ["INBOX"],
    is_unread: true,
    is_starred: false,
    is_sent: false,
    in_inbox: true,
    has_attachments: false,
    attachments: [],
    list_id: null,
    list_unsubscribe: null,
    auto_submitted: null,
    precedence: null,
    signals: {},
    category: null,
    snoozed_until: null,
    snooze_until_reply: false,
    done_at: null,
    ...over,
  };
}

export const ME = new Set(["me@x.test"]);
