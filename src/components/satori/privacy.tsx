"use client";

import { PageHeader } from "./ui";

export function PrivacyPage() {
  const items: [string, string][] = [
    ["What's stored", "Your requests, generated prompts and their versions, saved library items, templates, profiles, settings, analyses and test runs — in your own Supabase database, protected by row-level security so only your account can read them. Usage records hold token counts and estimated cost, never prompt text."],
    ["What's sent to AI providers", "When you generate, refine, analyze or test, the relevant text is sent to the AI provider shown on the result (for example Anthropic for Claude). Under these providers' commercial API terms, API data isn't used to train their models by default; check each provider's current policy. Nothing is sent until you press a button."],
    ["Voice input", "Dictation uses your browser's speech recognition when available (the browser maker may process the audio). If you opt in to cloud dictation, audio streams to Deepgram for transcription. PromptSatori never stores audio; you review the transcript before it's used."],
    ["Images", "Images you attach are shrunk in your browser first, which also removes hidden photo data such as GPS location. They're sent to the AI provider for that one request and are not saved by PromptSatori; saved test runs record only how many images were used."],
    ["Websites", "When you add a website, PromptSatori's server reads that one page (public pages only) and sends its text with your request. The page text isn't stored; history and saved runs keep only the address and title."],
    ["Web search and connected apps", "In the Testing Lab, Claude can search the web (through Anthropic) and use apps you connect in Settings. Connected apps receive whatever Claude sends them and can take actions if a prompt asks. Access tokens are encrypted on the server and never sent to your browser."],
    ["On this device", "Drafts, the current session and appearance settings are kept in your browser's local storage so nothing is lost if a request fails or you refresh. Clearing site data removes them."],
    ["Logs", "Server logs record errors and which service failed — not the content of your prompts."],
    ["API keys", "Provider keys stay on the server. The browser never receives them."],
    ["Retention and deletion", "Choose how long history, analyses and test runs are kept in Settings → Your data, export everything as JSON, or delete all PromptSatori data at once. Deleting your account in Supabase removes all of it."],
    ["Quality scores", "Analyzer scores are heuristic indicators, not measurements of performance. AI ratings in the Testing Lab are another model's opinion, not fact-checking."],
  ];
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Privacy" subtitle="Plain-English summary of what PromptSatori keeps and where your text goes." />
      <dl className="ps-card divide-y" style={{ borderColor: "var(--ps-line)" }}>
        {items.map(([k, v]) => (
          <div key={k} className="space-y-1 p-4" style={{ borderColor: "var(--ps-line)" }}>
            <dt className="font-semibold">{k}</dt>
            <dd className="text-sm ps-soft">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
