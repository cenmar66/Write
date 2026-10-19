"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowUp, Copy, CornerDownLeft, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/docs";
import { streamFetch } from "@/lib/stream";
import { Drawer } from "./drawer";

const STARTERS = [
  "What's the weakest part of this?",
  "Suggest 5 better titles",
  "Write a punchy opening line",
  "Summarize this in 3 bullets",
];

export function ChatPanel({
  supabase,
  documentId,
  getDocument,
  onInsert,
  onClose,
}: {
  supabase: SupabaseClient;
  documentId: string;
  getDocument: () => { title: string; markdown: string };
  onInsert: (markdown: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("chat_messages")
      .select("id,role,content")
      .eq("document_id", documentId)
      .order("created_at")
      .then(({ data }) => setMessages((data as ChatMessage[]) ?? []));
  }, [supabase, documentId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    setBusy(true);
    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    await supabase.from("chat_messages").insert({ document_id: documentId, role: "user", content });

    const { title, markdown } = getDocument();
    let reply = "";
    try {
      reply = await streamFetch(
        "/api/ai/chat",
        { title, document: markdown, documentId, messages: history.map(({ role, content }) => ({ role, content })) },
        (soFar) => setMessages([...history, { role: "assistant", content: soFar }]),
      );
    } catch (e) {
      reply = (e as Error).message;
      setMessages([...history, { role: "assistant", content: reply }]);
    }
    if (reply) await supabase.from("chat_messages").insert({ document_id: documentId, role: "assistant", content: reply });
    setBusy(false);
  }

  async function clear() {
    if (!confirm("Clear this chat?")) return;
    await supabase.from("chat_messages").delete().eq("document_id", documentId);
    setMessages([]);
  }

  return (
    <Drawer
      title="Chat"
      onClose={onClose}
      actions={
        messages.length > 0 && (
          <button onClick={clear} aria-label="Clear chat" className="rounded-full p-2 text-muted hover:bg-surface-strong hover:text-ink">
            <Trash2 size={16} />
          </button>
        )
      }
    >
      <div className="flex min-h-full flex-col">
        <div className="flex-1 space-y-4 p-5">
          {messages.length === 0 && (
            <div className="pt-6 text-center">
              <div className="bg-gradient-brand mx-auto grid size-12 place-items-center rounded-2xl text-white">
                <Sparkles size={20} />
              </div>
              <p className="mt-3 font-display text-xl">Talk about this doc</p>
              <p className="mt-1 text-sm text-muted">I can see everything you’ve written.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full bg-surface-strong px-3 py-1.5 text-sm transition hover:text-accent">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={m.id ?? i} className="ml-10 rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-bg whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <div key={m.id ?? i} className="group mr-4">
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                  {m.content || <span className="animate-pulse text-muted">Thinking…</span>}
                </div>
                {m.content && !(busy && i === messages.length - 1) && (
                  <div className="mt-1.5 flex gap-1 text-xs text-muted">
                    <button onClick={() => onInsert(m.content)} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-surface-strong hover:text-ink">
                      <CornerDownLeft size={12} /> Insert into doc
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(m.content)}
                      className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-surface-strong hover:text-ink"
                    >
                      <Copy size={12} /> Copy
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
          <div ref={bottom} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="sticky bottom-0 bg-bg p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-end gap-2 rounded-2xl bg-surface-strong p-2 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask anything about your doc…"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="bg-gradient-brand grid size-9 place-items-center rounded-xl text-white transition disabled:opacity-40"
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </form>
      </div>
    </Drawer>
  );
}
