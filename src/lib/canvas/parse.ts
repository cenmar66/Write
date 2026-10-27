// Rule-based interpretation of typed or dictated quick-capture text.
// It never throws and never drops text: if nothing matches, the whole transcript
// comes back as a plain task (or note) for the person to confirm or edit.

import * as chrono from "chrono-node";
import type { ISODate, TaskSection } from "./types";

export type CaptureKind = "task" | "appointment" | "idea" | "journal" | "note" | "exercise" | "water";

export interface Capture {
  kind: CaptureKind;
  section?: TaskSection;
  title: string;
  date?: ISODate;
  time?: string; // HH:MM
  contactName?: string;
  durationMin?: number;
  glasses?: number;
  quantity?: string;
  /** "high" = a clear command matched; "low" = best guess, ask before acting. */
  confidence: "high" | "low";
  transcript: string;
}

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30", forty: "40", "forty-five": "45", sixty: "60", ninety: "90",
  una: "1", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
  once: "11", doce: "12", treinta: "30", sesenta: "60",
};

function normaliseNumbers(s: string): string {
  return s.replace(/\b(at|a las|a la|for|por|add|añade|drank|bebí)\s+([a-zñ-]+)\b/gi, (m, pre: string, word: string) => {
    const n = NUMBER_WORDS[word.toLowerCase()];
    return n ? `${pre} ${n}` : m;
  });
}

const pad = (n: number) => String(n).padStart(2, "0");
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const tidy = (s: string) =>
  s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^[\s,:;-]+|[\s,:;-]+$/g, "")
    .trim();

function stripDate(text: string, matched: string): string {
  return tidy(text.replace(matched, " "));
}

interface When {
  date?: ISODate;
  time?: string;
  matched?: string;
}

function findWhen(text: string, ref: Date, spanish: boolean): When {
  const parser = spanish ? chrono.es : chrono;
  const results = parser.parse(text, ref, { forwardDate: true });
  const r = results[0];
  if (!r) return {};
  const s = r.start;
  const date = `${s.get("year")}-${pad(s.get("month") ?? 1)}-${pad(s.get("day") ?? 1)}`;
  let time: string | undefined;
  if (s.isCertain("hour")) {
    let h = s.get("hour") ?? 0;
    // "at two" with no am/pm: people mean the afternoon for 1-7.
    if (!s.isCertain("meridiem") && h >= 1 && h <= 7) h += 12;
    time = `${pad(h)}:${pad(s.get("minute") ?? 0)}`;
  }
  return { date, time, matched: r.text };
}

const isSpanish = (s: string) =>
  /\b(mañana|hoy|llamar|comprar|añade|agrega|reunión|cita|lista|ideas?\s+grandes|a las|lunes|martes|miércoles|jueves|viernes|sábado|domingo|agua)\b/i.test(
    s,
  );

export function interpret(
  raw: string,
  opts: { today: ISODate; defaultSection?: TaskSection; now?: Date } = { today: "1970-01-01" },
): Capture {
  const transcript = raw.trim();
  const base: Capture = {
    kind: "task",
    section: opts.defaultSection ?? "personal",
    title: cap(tidy(transcript)),
    confidence: "low",
    transcript,
  };
  if (!transcript) return base;
  try {
    return interpretInner(transcript, opts, base);
  } catch {
    return base;
  }
}

function interpretInner(
  transcript: string,
  opts: { today: ISODate; defaultSection?: TaskSection; now?: Date },
  base: Capture,
): Capture {
  const spanish = isSpanish(transcript);
  const text = normaliseNumbers(transcript);
  const ref = opts.now ?? new Date(opts.today + "T09:00:00");
  let m: RegExpMatchArray | null;

  // Big ideas: "Add this to my big ideas: ..." / "Idea: ..." / "big idea ..."
  if ((m = text.match(/^(?:add (?:this )?to (?:my )?big ideas?|big idea|idea|nueva idea|idea grande)\s*[:,-]?\s*(.+)$/i)) ||
      (m = text.match(/^(?:add|añade|agrega)\s+(.+?)\s+(?:to|a)\s+(?:my |mis )?(?:big )?ideas?(?: grandes)?\.?$/i))) {
    return { ...base, kind: "idea", section: undefined, title: cap(tidy(m[1])), confidence: "high" };
  }

  // Good things: "good thing: ...", "grateful for ...", "agradecido por ..."
  if ((m = text.match(/^(?:good thing|something good|win|gratitude|grateful for|i'?m grateful (?:for|that)|agradecid[oa] por|algo bueno)\s*[:,-]?\s*(.+)$/i))) {
    return { ...base, kind: "journal", section: undefined, title: cap(tidy(m[1])), confidence: "high" };
  }

  // Notes: "note: ..." / "nota: ..."
  if ((m = text.match(/^(?:note|nota|add a note|anota)\s*[:,-]?\s*(.+)$/i))) {
    return { ...base, kind: "note", section: undefined, title: tidy(m[1]), confidence: "high" };
  }

  // Water: "drank 2 glasses of water", "add a glass of water", "bebí 2 vasos de agua"
  if (/\b(glass(es)?|vasos?) (of|de) (water|agua)\b|\bwater\b.*\bglass/i.test(text)) {
    const n = text.match(/(\d+)\s*(glass|vaso)/i);
    return { ...base, kind: "water", section: undefined, title: "Water", glasses: n ? Number(n[1]) : 1, confidence: "high" };
  }

  // Exercise: "played tennis for 60 minutes", "ran 30 min", "sauna 20 minutes"
  const exercise = text.match(
    /^(?:(?:i )?(?:played|did|went|had|logged?)\s+)?(?:a\s+)?(tennis|resistance training|strength training|weights|lifting|cycling|bike ride|ride|walk|walking|run|ran|running|swim|swimming|yoga|pilates|sauna|hike|hiking|gym|workout)\b.*?(\d+)\s*(?:min|minutes|mins|minutos|hours?|horas?)/i,
  );
  if (exercise) {
    const hours = /hour|hora/i.test(exercise[0]);
    const activity = exercise[1].toLowerCase().replace(/^ran$/, "running");
    return {
      ...base,
      kind: "exercise",
      section: undefined,
      title: cap(activity),
      durationMin: Number(exercise[2]) * (hours ? 60 : 1),
      confidence: "high",
    };
  }

  // Shopping: "Add buy batteries to my shopping list", "buy milk", "comprar pan"
  if ((m = text.match(/^(?:add\s+)?(?:buy\s+)?(.+?)\s+to (?:my |the )?(?:shopping|grocery|to buy) list\.?$/i)) ||
      (m = text.match(/^(?:añade|agrega)\s+(.+?)\s+a (?:la |mi )?lista(?: de (?:compras|la compra))?\.?$/i)) ||
      (m = text.match(/^(?:buy|pick up|get|comprar|compra)\s+(.+)$/i))) {
    let item = tidy(m[1].replace(/^(buy|comprar)\s+/i, ""));
    let quantity: string | undefined;
    const q = item.match(/^(\d+)\s+(.+)$/);
    if (q) {
      quantity = q[1];
      item = q[2];
    }
    return { ...base, kind: "task", section: "shopping", title: cap(item), quantity, confidence: "high" };
  }

  const when = findWhen(text, ref, spanish);
  const withoutWhen = when.matched ? stripDate(text, when.matched) : tidy(text);

  // Appointments: "Schedule a client meeting Friday at two", "lunch with Alex tomorrow at 1"
  if ((m = withoutWhen.match(/^(?:schedule|book|set up|add an? (?:appointment|meeting)|agenda|programa)\s+(?:an?\s+)?(.+)$/i)) ||
      (/\b(meeting|appointment|lunch with|dinner with|coffee with|call with|reunión|cita)\b/i.test(withoutWhen) && when.time)) {
    const title = cap(tidy((m ? m[1] : withoutWhen).replace(/^(an?|una?)\s+/i, "")));
    return {
      ...base,
      kind: "appointment",
      section: undefined,
      title,
      date: when.date ?? opts.today,
      time: when.time,
      confidence: when.date ? "high" : "low",
    };
  }

  // Emails / calls: "Call John tomorrow morning about the proposal", "email Sarah re: budget"
  if ((m = withoutWhen.match(/^(call|phone|ring|email|e-mail|text|message|follow up with|reply to|llamar a|llama a|escribir a|escribe a)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ'-]*)(.*)$/i))) {
    const verb = m[1].toLowerCase();
    const name = cap(m[2]);
    const verbTitle = /llam/.test(verb) ? "Llamar a" : /escrib/.test(verb) ? "Escribir a" : cap(verb);
    return {
      ...base,
      kind: "task",
      section: "comms",
      title: tidy(`${verbTitle} ${name}${m[3]}`),
      contactName: name,
      date: when.date,
      time: when.time,
      confidence: "high",
    };
  }

  // Explicit section words.
  let section = opts.defaultSection ?? "personal";
  let title = withoutWhen;
  let confidence: Capture["confidence"] = "low";
  if ((m = title.match(/^(?:must do|priority|important|top priority)\s*[:,-]?\s*(.+)$/i))) {
    section = "must";
    title = m[1];
    confidence = "high";
  } else if ((m = title.match(/^(?:work(?: task)?|trabajo)\s*[:,-]\s*(.+)$/i))) {
    section = "work";
    title = m[1];
    confidence = "high";
  } else if ((m = title.match(/^(?:personal(?: task)?)\s*[:,-]\s*(.+)$/i))) {
    section = "personal";
    title = m[1];
    confidence = "high";
  } else if ((m = title.match(/^(?:add|remind me to|i need to|need to|todo|to do|recuérdame|tengo que)\s*[:,-]?\s*(.+)$/i))) {
    title = m[1];
    confidence = "high";
  }
  title = title.replace(/\s+to (?:my )?(?:work|personal) (?:list|to-?dos?)$/i, (s) => {
    section = /work/i.test(s) ? "work" : "personal";
    return "";
  });
  return {
    ...base,
    kind: "task",
    section,
    title: cap(tidy(title)) || base.title,
    date: when.date,
    time: when.time,
    confidence,
  };
}
