// A deterministic stand-in for an AI provider, used ONLY in development and tests
// (INBOX_SIMULATED_AI=1, ignored in production builds). It builds plausible answers
// from the fenced input so the UI can be exercised without an API key. Every answer
// says it is simulated.

import type { JsonProvider } from "./providers";

const lineVal = (text: string, key: string) => text.match(new RegExp(`^${key}: (.*)$`, "mi"))?.[1]?.trim() ?? "";
const refs = (text: string) => [...text.matchAll(/^ref: ([\w-]+)$/gim)].map((m) => m[1]);

export const simulatedJson: JsonProvider = {
  available: () => true,
  async generate(req) {
    const u = req.user;
    const subject = lineVal(u, "subject") || "your message";
    const from = lineVal(u, "from").replace(/<.*>/, "").trim() || "there";
    const ids = refs(u);
    let data: unknown;
    switch (req.schemaName) {
      case "classification":
        data = { importance: "normal", msg_type: "other", action: /\?/.test(u) ? "reply_needed" : "informational", time_sensitivity: "unknown", confidence: 0.6, explanation: "[Simulated AI] Looks like a regular personal message." };
        break;
      case "draft": {
        const first = from.split(/\s+/)[0] || "there";
        data = { subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`, body: `Hi ${first},\n\nThanks for your note about “${subject}”. [Simulated AI draft: replace with your reply.]\n\nBest,`, notes: "Simulated AI (development mode). No real model was called." };
        break;
      }
      case "rewrite":
        data = { body: `${lineVal(u, "draft") || "…"}\n\n[Simulated AI rewrite]`, notes: "Simulated AI (development mode)." };
        break;
      case "summary":
        data = { bullets: [{ text: `[Simulated] The sender writes about “${subject}”.`, refs: ids.slice(0, 1) }], next_steps: [{ text: "[Simulated] Decide whether a reply is needed.", refs: ids.slice(0, 1) }] };
        break;
      case "briefing_summary":
        data = { summary: [{ text: "[Simulated AI] Here is a short summary of the items below.", refs: ids.slice(0, 2) }] };
        break;
      case "task":
        data = { title: subject.replace(/^(re|fwd?):\s*/i, "").slice(0, 120) || "Follow up", description: "[Simulated AI suggestion]", due_date: null, due_explicit: false, priority: "normal" };
        break;
      case "search_plan":
        data = { keywords: u.split(/\s+/).filter((w) => w.length > 4).slice(0, 3), from: null, needs_reply: /respond|reply|waiting/i.test(u), category: null, importance: null, days: 30, sent_by_me: /i sent|did i send/i.test(u) };
        break;
      case "answer":
        data = { answer: ids.length ? `[Simulated AI] I found ${ids.length} related message(s).` : "[Simulated AI] I couldn't find evidence for that in your accessible mail.", refs: ids.slice(0, 5), insufficient: ids.length === 0 };
        break;
      default:
        data = {};
    }
    return { data, inputTokens: Math.ceil(u.length / 4), outputTokens: 120, model: "simulated" };
  },
};
