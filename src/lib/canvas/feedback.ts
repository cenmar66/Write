// The check-off feel: a soft pen-on-paper scratch (synthesised, no audio file) and a
// tiny haptic tick where the browser supports it. iOS Safari doesn't expose the
// Vibration API, so haptics there are a no-op (documented, not faked).

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
}

export function penScratch(volume = 0.18) {
  try {
    const a = audio();
    if (!a) return;
    if (a.state === "suspended") void a.resume();
    if (!noise) {
      const len = Math.floor(a.sampleRate * 0.22);
      noise = a.createBuffer(1, len, a.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 90));
    }
    const t = a.currentTime;
    // Two quick strokes: the short down-stroke and the longer up-stroke of a tick.
    for (const [start, dur, freq] of [
      [0, 0.06, 2600],
      [0.07, 0.13, 3400],
    ] as const) {
      const src = a.createBufferSource();
      src.buffer = noise;
      const bp = a.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(freq, t + start);
      bp.frequency.linearRampToValueAtTime(freq * 1.25, t + start + dur);
      bp.Q.value = 0.9;
      const g = a.createGain();
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(volume, t + start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t + start + dur);
      src.connect(bp).connect(g).connect(a.destination);
      src.start(t + start, Math.random() * 0.05, dur + 0.02);
    }
  } catch {
    /* sound is a nicety */
  }
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
