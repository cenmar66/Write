import type { JSONContent } from "@tiptap/react";
import { type Account, ReconnectError, readJson } from "./accounts";

// Substack has no official API. This uses your browser session cookie, the same way the
// widely used unofficial libraries do, and only ever creates drafts.

const cookieHeader = (cookie: string) => (cookie.includes("=") ? cookie : `substack.sid=${cookie}`);

async function call<T>(url: string, cookie: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Cookie: cookieHeader(cookie), "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    redirect: "manual",
  });
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new ReconnectError("Substack: your session cookie expired or is wrong. Reconnect Substack in Settings.");
  }
  return readJson<T>(res, "Substack");
}

export async function substackProfile(cookie: string) {
  const p = await call<{
    id: number;
    name: string;
    photo_url?: string;
    primaryPublication?: { subdomain: string; name: string; custom_domain?: string | null };
    publicationUsers?: { is_primary?: boolean; publication: { subdomain: string; name: string } }[];
  }>("https://substack.com/api/v1/user/profile/self", cookie);
  const pub = p.primaryPublication ?? p.publicationUsers?.find((u) => u.is_primary)?.publication ?? p.publicationUsers?.[0]?.publication;
  return { userId: p.id, name: p.name, photo: p.photo_url, subdomain: pub?.subdomain, publication: pub?.name };
}

// Tiptap uses camelCase node names; Substack's editor uses the classic ProseMirror names.
const NODE_NAMES: Record<string, string> = {
  bulletList: "bullet_list",
  orderedList: "ordered_list",
  listItem: "list_item",
  horizontalRule: "horizontal_rule",
  hardBreak: "hard_break",
};
const MARK_NAMES: Record<string, string> = { bold: "strong", italic: "em", strike: "strikethrough", code: "code", link: "link" };

export function toSubstackDoc(node: JSONContent): JSONContent {
  if (node.type === "text") {
    const marks = (node.marks ?? [])
      .filter((m) => MARK_NAMES[m.type])
      .map((m) => (m.type === "link" ? { type: "link", attrs: { href: m.attrs?.href } } : { type: MARK_NAMES[m.type] }));
    return { type: "text", text: node.text, ...(marks.length ? { marks } : {}) };
  }
  if (node.type === "codeBlock") {
    const text = (node.content ?? []).map((c) => c.text ?? "").join("");
    return { type: "paragraph", content: text ? [{ type: "text", text, marks: [{ type: "code" }] }] : [] };
  }
  const out: JSONContent = { type: NODE_NAMES[node.type ?? ""] ?? node.type };
  if (node.type === "heading") out.attrs = { level: Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 6) };
  if (node.type === "orderedList" && node.attrs?.start && node.attrs.start !== 1) out.attrs = { order: node.attrs.start };
  if (node.content) out.content = node.content.map(toSubstackDoc);
  return out;
}

export async function createSubstackDraft(
  account: Account,
  draft: { title: string; subtitle: string; description: string; body: JSONContent },
): Promise<{ id: number; editUrl: string }> {
  const sub = account.meta.subdomain as string;
  const res = await call<{ id: number }>(`https://${sub}.substack.com/api/v1/drafts`, account.token!, {
    method: "POST",
    body: JSON.stringify({
      draft_title: draft.title,
      draft_subtitle: draft.subtitle,
      draft_body: JSON.stringify(toSubstackDoc({ type: "doc", content: draft.body.content ?? [] })),
      draft_bylines: [{ id: Number(account.accountId), is_guest: false }],
      audience: "everyone",
      section_chosen: true,
      write_comment_permissions: "everyone",
      search_engine_description: draft.description || undefined,
    }),
  });
  return { id: res.id, editUrl: `https://${sub}.substack.com/publish/post/${res.id}` };
}
