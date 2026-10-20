"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DictationStatus = "idle" | "starting" | "listening" | "stopping" | "error";

// Runs on the audio thread: turns microphone samples into 16-bit PCM in ~100ms chunks,
// and reports a loudness level for the animated mic ring.
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.size = Math.round(sampleRate / 10); }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let sum = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      sum += s * s;
      this.buf.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }
    if (this.buf.length >= this.size) {
      const pcm = Int16Array.from(this.buf);
      this.buf = [];
      this.port.postMessage({ pcm: pcm.buffer, level: Math.sqrt(sum / ch.length) }, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

type DeepgramMessage = {
  type?: string;
  is_final?: boolean;
  channel?: { alternatives?: { transcript?: string; languages?: string[] }[] };
};

/** Live speech-to-text with Deepgram (English + Spanish auto-detect). */
export function useDictation() {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const finals = useRef<string[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const pending = useRef<ArrayBuffer[]>([]);
  const closed = useRef<(() => void) | null>(null);

  const teardownAudio = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    if (ws.current) return;
    setError(null);
    setStatus("starting");
    finals.current = [];
    pending.current = [];
    setFinalText("");
    setInterim("");
    setLanguages([]);

    // Create audio objects right away: phones only allow it during the tap itself.
    const audio = new AudioContext();
    ctx.current = audio;
    const media = navigator.mediaDevices
      ?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      .catch(() => null);
    const tokenReq = fetch("/api/dictation/token", { method: "POST" })
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as { token?: string; error?: string } }))
      .catch(() => ({ ok: false, body: { error: "Couldn't reach the server." } as { token?: string; error?: string } }));

    const [mic, token] = await Promise.all([media, tokenReq]);
    if (!mic) {
      teardownAudio();
      setError("Microphone access is blocked. Allow it in your browser settings, then try again.");
      setStatus("error");
      return;
    }
    stream.current = mic;
    if (!token.ok || !token.body.token) {
      teardownAudio();
      setError(token.body.error ?? "Dictation isn't available right now.");
      setStatus("error");
      return;
    }

    const params = new URLSearchParams({
      model: "nova-3",
      language: "multi",
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
      endpointing: "300",
      encoding: "linear16",
      sample_rate: String(audio.sampleRate),
      channels: "1",
      // Privacy: don't let Deepgram keep your audio to improve its models.
      mip_opt_out: "true",
    });
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["bearer", token.body.token]);
    socket.binaryType = "arraybuffer";
    ws.current = socket;

    socket.onopen = () => {
      pending.current.forEach((chunk) => socket.send(chunk));
      pending.current = [];
      setStatus("listening");
    };
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as DeepgramMessage;
      if (msg.type !== "Results") return;
      const alt = msg.channel?.alternatives?.[0];
      const text = alt?.transcript ?? "";
      if (alt?.languages?.length) setLanguages((prev) => Array.from(new Set([...prev, ...alt.languages!])));
      if (msg.is_final) {
        if (text) finals.current.push(text);
        setFinalText(finals.current.join(" "));
        setInterim("");
      } else {
        setInterim(text);
      }
    };
    socket.onerror = () => {
      setError("Lost the connection to the speech service.");
    };
    socket.onclose = () => {
      ws.current = null;
      teardownAudio();
      closed.current?.();
      closed.current = null;
      setStatus((s) => (s === "error" ? s : "idle"));
    };

    try {
      await audio.resume();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await audio.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const source = audio.createMediaStreamSource(mic);
      const node = new AudioWorkletNode(audio, "pcm-capture");
      node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
        setLevel(e.data.level);
        if (socket.readyState === WebSocket.OPEN) socket.send(e.data.pcm);
        else if (socket.readyState === WebSocket.CONNECTING) pending.current.push(e.data.pcm);
      };
      source.connect(node);
    } catch {
      // Stopped while still starting up, or this browser can't capture audio.
      if (ws.current === socket) {
        setError("Couldn't start the microphone in this browser.");
        setStatus("error");
        socket.close();
      }
    }
  }, [teardownAudio]);

  /** Stops listening and resolves with everything that was said. */
  const stop = useCallback(async (): Promise<string> => {
    const socket = ws.current;
    stream.current?.getTracks().forEach((t) => t.stop());
    if (!socket) {
      teardownAudio();
      return finals.current.join(" ");
    }
    setStatus("stopping");
    // Deepgram sends any last words, then closes the connection.
    await new Promise<void>((resolve) => {
      closed.current = resolve;
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "CloseStream" }));
      else socket.close();
      setTimeout(() => {
        if (closed.current === resolve) {
          socket.close();
          resolve();
        }
      }, 4000);
    });
    return finals.current.join(" ").trim();
  }, [teardownAudio]);

  const cancel = useCallback(() => {
    ws.current?.close();
    ws.current = null;
    teardownAudio();
    finals.current = [];
    setFinalText("");
    setInterim("");
    setStatus("idle");
  }, [teardownAudio]);

  useEffect(() => () => cancel(), [cancel]);

  return { status, finalText, interim, languages, level, error, start, stop, cancel };
}
