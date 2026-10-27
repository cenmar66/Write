"use client";

// Dictation for every text field. Two engines:
//  • "browser": the Web Speech API (Chrome, Edge, Safari on macOS/iOS). Safari may send
//    audio to Apple for recognition; Chrome sends it to Google. Nothing is stored by us.
//  • "cloud": Deepgram via Write.ai's existing token route, for browsers without the
//    Web Speech API (for example some iPhone home-screen apps). Audio streams to
//    Deepgram for transcription; it is not saved by this app. Used only after the
//    person has agreed to it on this device.
// The transcript is always shown for review and inserted into the field — never saved
// on its own — so the person can edit before anything is kept.

import { Mic, MicOff, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDictation as useDeepgram } from "@/lib/dictation/use-dictation";
import { useCanvas } from "./provider";

type Engine = "browser" | "cloud" | "none";
type Status = "idle" | "listening" | "error";

interface SpeechRecognitionLike {
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

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const CLOUD_OK_KEY = "dc-cloud-dictation-ok";
export const ENGINE_KEY = "dc-dictation-engine";

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export function preferredEngine(): Engine {
  const pref = readLocal(ENGINE_KEY);
  const hasBrowser = !!getRecognition();
  if (pref === "cloud") return "cloud";
  if (pref === "browser") return hasBrowser ? "browser" : "none";
  return hasBrowser ? "browser" : "cloud";
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings, or use the mic key on your keyboard.",
  "service-not-allowed": "Speech recognition isn't allowed here. Try your keyboard's dictation key instead.",
  "no-speech": "Didn't catch anything. Try again a little closer to the mic.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection on this device.",
  aborted: "",
};

export function useSpeech(lang: string) {
  const [engine, setEngine] = useState<Engine>("none");
  const [status, setStatus] = useState<Status>("idle");
  const [interim, setInterim] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const finals = useRef<string[]>([]);
  const dg = useDeepgram();

  useEffect(() => setEngine(preferredEngine()), []);

  const start = useCallback(async () => {
    setError(null);
    setInterim("");
    setText("");
    finals.current = [];
    const eng = preferredEngine();
    setEngine(eng);
    if (eng === "cloud") {
      if (readLocal(CLOUD_OK_KEY) !== "yes") {
        const ok = window.confirm(
          "This browser has no built-in speech recognition. Use cloud dictation instead?\n\nYour voice will stream to Deepgram to be turned into text. The audio isn't saved by The Daily Canvas.",
        );
        if (!ok) {
          setError("Tip: tap the microphone key on your keyboard to dictate with your device instead.");
          setStatus("error");
          return;
        }
        writeLocal(CLOUD_OK_KEY, "yes");
      }
      setStatus("listening");
      await dg.start();
      return;
    }
    const R = getRecognition();
    if (!R) {
      setError("Dictation isn't available in this browser. Use the mic key on your keyboard.");
      setStatus("error");
      return;
    }
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
      const msg = ERRORS[e.error] ?? `Dictation stopped (${e.error}).`;
      if (msg) {
        setError(msg);
        setStatus("error");
      }
    };
    r.onend = () => {
      setStatus((s) => (s === "listening" ? "idle" : s));
      setInterim("");
    };
    rec.current = r;
    try {
      r.start();
      setStatus("listening");
    } catch {
      setError("Couldn't start the microphone.");
      setStatus("error");
    }
  }, [lang, dg]);

  const stop = useCallback(async (): Promise<string> => {
    if (engine === "cloud") {
      const t = await dg.stop();
      setStatus("idle");
      return t;
    }
    const r = rec.current;
    if (!r) return finals.current.join(" ");
    await new Promise<void>((resolve) => {
      const prev = r.onend;
      r.onend = () => {
        prev?.();
        resolve();
      };
      try {
        r.stop();
      } catch {
        resolve();
      }
      setTimeout(resolve, 1500);
    });
    rec.current = null;
    setStatus("idle");
    return [finals.current.join(" "), interim].filter(Boolean).join(" ").trim();
  }, [engine, dg, interim]);

  const cancel = useCallback(() => {
    try {
      rec.current?.abort();
    } catch {
      /* ignore */
    }
    rec.current = null;
    dg.cancel();
    finals.current = [];
    setText("");
    setInterim("");
    setStatus("idle");
  }, [dg]);

  useEffect(() => () => rec.current?.abort(), []);

  const cloud = engine === "cloud";
  return {
    engine,
    status: cloud ? (dg.status === "listening" || dg.status === "starting" ? "listening" : dg.status === "error" ? "error" : status) : status,
    text: cloud ? dg.finalText : text,
    interim: cloud ? dg.interim : interim,
    error: cloud ? dg.error ?? error : error,
    start,
    stop,
    cancel,
  };
}

/**
 * Microphone button for a field. Shows a live transcript; "Insert" hands the text to
 * the field for editing. Nothing is saved until the person saves the field itself.
 */
export function MicButton({
  onText,
  label = "Dictate",
  size = "sm",
}: {
  onText: (text: string) => void;
  label?: string;
  size?: "sm" | "md";
}) {
  const { prefs } = useCanvas();
  const s = useSpeech(prefs.dictation_lang);
  const [open, setOpen] = useState(false);
  const live = s.status === "listening";

  const begin = async () => {
    setOpen(true);
    await s.start();
  };
  const finish = async () => {
    const t = await s.stop();
    if (t) onText(t);
    setOpen(false);
  };
  const close = () => {
    s.cancel();
    setOpen(false);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={`dc-icon-btn ${size === "sm" ? "sm" : ""} ${live ? "dc-mic-live" : ""}`}
        style={live ? { color: "#b83a3a" } : undefined}
        aria-label={live ? "Stop dictation" : label}
        aria-pressed={live}
        title={live ? "Stop and insert" : label}
        onClick={() => (live ? finish() : begin())}
      >
        {live ? <Square size={14} fill="currentColor" /> : <Mic size={size === "sm" ? 15 : 18} />}
      </button>
      {open && (
        <div
          role="status"
          aria-live="polite"
          className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl p-3 text-sm shadow-xl"
          style={{ background: "var(--dc-paper)", border: "1px solid var(--dc-line)" }}
        >
          <div className="mb-1 flex items-center gap-2 text-xs" style={{ color: "var(--dc-muted)" }}>
            {s.status === "error" ? <MicOff size={13} /> : <span className="inline-block h-2 w-2 rounded-full bg-red-500" />}
            {s.status === "error" ? "Dictation problem" : live ? `Listening (${prefs.dictation_lang})${s.engine === "cloud" ? " · cloud" : ""}` : "Starting…"}
            <button className="dc-icon-btn sm ml-auto" aria-label="Cancel dictation" onClick={close}>
              <X size={14} />
            </button>
          </div>
          {s.error ? (
            <p style={{ color: "#a33" }}>{s.error}</p>
          ) : (
            <p className="min-h-10">
              {s.text} <span style={{ color: "var(--dc-faint)" }}>{s.interim}</span>
              {!s.text && !s.interim && <span style={{ color: "var(--dc-faint)" }}>Speak now…</span>}
            </p>
          )}
          {!s.error && (
            <div className="mt-2 flex justify-end gap-2">
              <button className="dc-btn" onClick={close}>
                Cancel
              </button>
              <button className="dc-btn dc-btn-primary" onClick={finish}>
                Insert
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
