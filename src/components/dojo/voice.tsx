"use client";

// Dictation for the generator. Two engines:
//  • Browser speech recognition (Web Speech API) when available. The browser vendor may
//    process audio on its servers (Chrome → Google, Safari → Apple). We store nothing.
//  • Fallback: Deepgram live transcription through Write.ai's existing token route, only
//    after the person agrees, and only if DEEPGRAM_API_KEY is configured.
// Raw audio is never stored. The transcript is always shown for review/editing first.
import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDictation as useDeepgram } from "@/lib/dictation/use-dictation";
import { readLocal, writeLocal } from "./client";

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings (look for the lock or mic icon in the address bar).",
  "service-not-allowed": "Speech recognition isn't allowed here. Try your keyboard's dictation key instead.",
  "no-speech": "Didn't hear anything. Try again a little closer to the mic.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
};

/** Mic button + review panel. Calls onInsert with the reviewed text. */
export function VoiceInput({ onInsert, lang = "en-US" }: { onInsert: (text: string) => void; lang?: string }) {
  const [state, setState] = useState<"idle" | "listening" | "review" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [engine, setEngine] = useState<"browser" | "cloud">("browser");
  const rec = useRef<Recognition | null>(null);
  const finals = useRef<string[]>([]);
  const dg = useDeepgram();

  useEffect(() => () => rec.current?.abort(), []);

  // While the cloud engine is recording, show its live transcript and errors directly.
  const cloudLive = engine === "cloud" && state === "listening";
  const cloudError = engine === "cloud" && dg.status === "error" ? dg.error : null;
  const shownState = cloudError && state === "listening" ? "error" : state;
  const shownError = error ?? cloudError;
  const liveText = cloudLive ? dg.finalText : text;
  const liveInterim = cloudLive ? dg.interim : interim;

  const start = useCallback(async () => {
    setError(null);
    setText("");
    setInterim("");
    finals.current = [];
    const R = getRecognition();
    if (!R) {
      if (!readLocal<boolean>("pd-cloud-dictation-ok", false)) {
        const ok = window.confirm("This browser has no built-in speech recognition. Use cloud dictation instead?\n\nYour voice streams to Deepgram to be turned into text. PromptDojo doesn't store the audio.");
        if (!ok) {
          setError("Tip: use the microphone key on your keyboard to dictate instead.");
          setState("error");
          return;
        }
        writeLocal("pd-cloud-dictation-ok", true);
      }
      setEngine("cloud");
      setState("listening");
      await dg.start();
      return;
    }
    setEngine("browser");
    const r = new R();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let inter = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals.current.push(res[0].transcript.trim());
        else inter += res[0].transcript;
      }
      setText(finals.current.join(" "));
      setInterim(inter);
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      setError(ERRORS[e.error] ?? `Dictation stopped (${e.error}).`);
      setState("error");
    };
    r.onend = () => {
      setInterim("");
      setState((s) => (s === "listening" ? "review" : s));
    };
    rec.current = r;
    try {
      r.start();
      setState("listening");
    } catch {
      setError("Couldn't start the microphone.");
      setState("error");
    }
  }, [lang, dg]);

  const stop = useCallback(async () => {
    if (engine === "cloud") {
      const t = await dg.stop();
      setText(t);
      setState("review");
      return;
    }
    rec.current?.stop();
  }, [engine, dg]);

  const discard = () => {
    rec.current?.abort();
    dg.cancel();
    setText("");
    setState("idle");
  };

  return (
    <div className="contents">
      {shownState === "listening" ? (
        <button type="button" className="pd-btn pd-btn-sm" onClick={stop} aria-label="Stop dictation" style={{ borderColor: "var(--pd-danger)", color: "var(--pd-danger)" }}>
          <Square size={13} fill="currentColor" aria-hidden />
          <span className="pd-pulse">Listening…</span>
        </button>
      ) : (
        <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost" onClick={start} aria-label="Dictate your request" title="Dictate">
          <Mic size={16} aria-hidden />
          <span className="hidden sm:inline">Dictate</span>
        </button>
      )}

      {(shownState === "listening" || shownState === "review" || shownState === "error") && (
        <div className="pd-card pd-fade-in mt-3 w-full basis-full space-y-2.5 p-3.5" role="region" aria-label="Dictation">
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block size-2.5 rounded-full ${shownState === "listening" ? "pd-pulse" : ""}`} style={{ background: shownState === "listening" ? "var(--pd-danger)" : shownState === "error" ? "var(--pd-warn)" : "var(--pd-ok)" }} aria-hidden />
            <span className="font-medium">{shownState === "listening" ? "Recording — speak naturally" : shownState === "error" ? "Dictation problem" : "Review your transcript"}</span>
            <span className="ml-auto text-xs pd-muted">{engine === "cloud" ? "Cloud (Deepgram)" : "Browser speech recognition"} · audio not stored</span>
          </div>
          {shownError && <p className="text-sm" style={{ color: "var(--pd-danger)" }}>{shownError}</p>}
          {shownState !== "error" && (
            <>
              <label htmlFor="pd-transcript" className="sr-only">
                Transcript
              </label>
              <textarea
                id="pd-transcript"
                className="pd-textarea min-h-20 text-sm"
                value={shownState === "listening" ? [liveText, liveInterim].filter(Boolean).join(" ") : text}
                onChange={(e) => setText(e.target.value)}
                readOnly={shownState === "listening"}
                placeholder={shownState === "listening" ? "Your words will appear here…" : "Nothing was transcribed."}
              />
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost" onClick={discard}>
              Discard
            </button>
            {shownState === "review" && (
              <button
                type="button"
                className="pd-btn pd-btn-sm pd-btn-primary"
                disabled={!text.trim()}
                onClick={() => {
                  onInsert(text.trim());
                  setText("");
                  setState("idle");
                }}
              >
                Insert into request
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
