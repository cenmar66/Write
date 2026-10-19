import type { JSONContent } from "@tiptap/react";

export type Folder = { id: string; name: string };

export type DocSummary = {
  id: string;
  title: string;
  content_text: string;
  folder_id: string | null;
  word_count: number;
  updated_at: string;
};

export type Doc = DocSummary & { content: JSONContent; style_id?: string | null };

/** Where the home screen leaves a brief for the editor to draft from. */
export const briefKey = (id: string) => `write.brief.${id}`;
export type Brief = { brief: string; styleId: string | null; sources: string };

export type Version = {
  id: string;
  label: string;
  title: string;
  content: JSONContent;
  content_text: string;
  created_at: string;
};

export type ChatMessage = { id?: string; role: "user" | "assistant"; content: string };

export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
