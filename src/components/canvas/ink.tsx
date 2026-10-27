"use client";

// Handwriting / annotation layer. Each section (and optionally the whole page) has a
// transparent canvas on top. In Pencil Mode:
//   • Apple Pencil (pointerType "pen") draws. Fingers keep scrolling the page: on iPad
//     Safari, touches whose touchType is "stylus" are the only ones we stop from scrolling.
//   • A mouse or trackpad draws too (useful on a Mac).
//   • Finger drawing is off unless turned on in the palette (palm rejection by design).
// Strokes are stored one row each, with points normalised to the zone's width, so they
// sync without conflicts and scale on other screens. Outside Pencil Mode ink is
// view-only on every device.

import { Eraser, Hand, Highlighter, PenLine, Redo2, Trash2, Undo2, X, Square, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { InkStroke, ISODate } from "@/lib/canvas/types";
import { useCanvas } from "./provider";

// ---- shared tool state ---------------------------------------------------------------
type Tool = "pen" | "highlighter" | "eraser";
interface ToolState {
  tool: Tool;
  color: string;
  width: number;
  finger: boolean;
  target: "sections" | "page";
}
let tools: ToolState = { tool: "pen", color: "#2c4a7a", width: 2.4, finger: false, target: "sections" };
const toolListeners = new Set<() => void>();
function setTools(p: Partial<ToolState>) {
  tools = { ...tools, ...p };
  toolListeners.forEach((l) => l());
}
function useTools() {
  return useSyncExternalStore(
    (l) => (toolListeners.add(l), () => toolListeners.delete(l)),
    () => tools,
    () => tools,
  );
}

type UndoOp = { kind: "add"; ids: string[] } | { kind: "erase"; ids: string[] };
const undoStack: UndoOp[] = [];
const redoStack: UndoOp[] = [];

export const INK_COLORS = ["#1f2328", "#2c4a7a", "#3f7356", "#8a3b4a", "#7d5a9e", "#c08a2c", "#4f8f94"];
const SCALE = 10000; // points stored as integers relative to zone width

// ---- drawing ---------------------------------------------------------------------------
function drawStroke(ctx: CanvasRenderingContext2D, s: Pick<InkStroke, "points" | "tool" | "color" | "width">, w: number) {
  const pts = s.points;
  if (pts.length < 3) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  if (s.tool === "highlighter") {
    ctx.globalAlpha = 0.28;
    ctx.globalCompositeOperation = "multiply";
  }
  const base = s.tool === "highlighter" ? s.width * 5 : s.width;
  const px = (i: number) => (pts[i] / SCALE) * w;
  if (pts.length === 3) {
    ctx.beginPath();
    ctx.arc(px(0), px(1), base / 2, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
  }
  for (let i = 3; i < pts.length; i += 3) {
    const pressure = pts[i + 2] / 100;
    ctx.lineWidth = s.tool === "highlighter" ? base : Math.max(0.6, base * (0.45 + pressure * 0.9));
    ctx.beginPath();
    const x0 = px(i - 3), y0 = px(i - 2), x1 = px(i), y1 = px(i + 1);
    if (i >= 6) {
      // Smooth through midpoints.
      const xm = (px(i - 6) + x0) / 2, ym = (px(i - 5) + y0) / 2;
      ctx.moveTo(xm, ym);
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    } else {
      ctx.moveTo(x0, y0);
      ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function hit(s: InkStroke, x: number, y: number, w: number, r: number) {
  for (let i = 0; i < s.points.length; i += 3) {
    const dx = (s.points[i] / SCALE) * w - x;
    const dy = (s.points[i + 1] / SCALE) * w - y;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

export function InkLayer({ date, zone, fixed = false }: { date: ISODate; zone: string; fixed?: boolean }) {
  const { planner, store, rev, pencil } = useCanvas();
  const t = useTools();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ points: number[]; pointerId: number } | null>(null);
  const erased = useRef<string[]>([]);
  const size = useRef({ w: 0, h: 0 });
  const active = pencil && (zone === "page" ? t.target === "page" : t.target === "sections");

  useEffect(() => {
    void store.ensureInk(date);
  }, [store, date]);

  const strokes = useMemo(() => planner.strokes(date, zone), [planner, date, zone, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.current.w, size.current.h);
    for (const s of strokes) drawStroke(ctx, s, size.current.w);
    if (live.current && tools.tool !== "eraser") drawStroke(ctx, { points: live.current.points, tool: tools.tool as "pen", color: tools.color, width: tools.width }, size.current.w);
  }, [strokes]);

  // Match the canvas to its box (and device pixels).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement!;
    const ro = new ResizeObserver(() => {
      const w = parent.clientWidth;
      const h = fixed ? parent.clientHeight : Math.max(parent.scrollHeight, parent.clientHeight);
      const dpr = window.devicePixelRatio || 1;
      size.current = { w, h };
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      redraw();
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [redraw, fixed]);

  useEffect(redraw, [redraw]);

  // Stop the page from scrolling under the Pencil (iPad Safari), but not under fingers.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !active) return;
    const block = (e: TouchEvent) => {
      const stylus = Array.from(e.touches).some((x) => (x as Touch & { touchType?: string }).touchType === "stylus");
      if (stylus || tools.finger) e.preventDefault();
    };
    c.addEventListener("touchstart", block, { passive: false });
    c.addEventListener("touchmove", block, { passive: false });
    return () => {
      c.removeEventListener("touchstart", block);
      c.removeEventListener("touchmove", block);
    };
  }, [active]);

  const accept = (e: React.PointerEvent) => e.pointerType === "pen" || e.pointerType === "mouse" || (e.pointerType === "touch" && tools.finger);

  const pos = (e: PointerEvent | React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 };
  };

  const eraseAt = (x: number, y: number) => {
    for (const s of strokes) {
      if (erased.current.includes(s.id)) continue;
      if (hit(s, x, y, size.current.w, 10)) {
        erased.current.push(s.id);
        store.remove("canvas_ink", s.id);
      }
    }
  };

  // Finger taps in Pencil Mode still work: a quick tap is passed to whatever is underneath
  // (a checkbox, a field), so typed and handwritten work can sit side by side.
  const tap = useRef<{ x: number; y: number; id: number } | null>(null);
  const forwardTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    c.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    c.style.pointerEvents = "";
    if (!el) return;
    if (el.matches("input, textarea, [contenteditable]")) el.focus();
    else el.click();
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (active && !accept(e)) {
      tap.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      return;
    }
    if (!active) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* some synthetic or already-released pointers can't be captured */
    }
    const { x, y, p } = pos(e);
    if (tools.tool === "eraser" || e.button === 5) {
      erased.current = [];
      live.current = { points: [], pointerId: e.pointerId };
      eraseAt(x, y);
      return;
    }
    const w = size.current.w || 1;
    live.current = { pointerId: e.pointerId, points: [Math.round((x / w) * SCALE), Math.round((y / w) * SCALE), Math.round(p * 100)] };
    redraw();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (!l || l.pointerId !== e.pointerId) return;
    e.preventDefault();
    // Coalesced events give smoother lines; some browsers return an empty list.
    const coalesced = e.nativeEvent.getCoalescedEvents?.() as PointerEvent[] | undefined;
    const events = coalesced && coalesced.length ? coalesced : [e.nativeEvent];
    const w = size.current.w || 1;
    for (const ev of events) {
      const { x, y, p } = pos(ev);
      if (tools.tool === "eraser") eraseAt(x, y);
      else l.points.push(Math.round((x / w) * SCALE), Math.round((y / w) * SCALE), Math.round(p * 100));
    }
    if (tools.tool !== "eraser") requestAnimationFrame(redraw);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const tp = tap.current;
    if (tp && tp.id === e.pointerId) {
      tap.current = null;
      if (e.type === "pointerup" && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 10) forwardTap(e);
      return;
    }
    const l = live.current;
    if (!l || l.pointerId !== e.pointerId) return;
    live.current = null;
    if (tools.tool === "eraser") {
      if (erased.current.length) {
        undoStack.push({ kind: "erase", ids: [...erased.current] });
        redoStack.length = 0;
      }
      erased.current = [];
      return;
    }
    if (l.points.length >= 3) {
      const s = planner.addStroke(date, zone, { tool: tools.tool as "pen" | "highlighter", color: tools.color, width: tools.width, points: l.points });
      undoStack.push({ kind: "add", ids: [s.id] });
      redoStack.length = 0;
    }
    redraw();
  };

  return (
    <canvas
      ref={canvasRef}
      className="dc-ink dc-noprint-ink"
      data-active={active}
      data-tool={t.tool}
      aria-hidden={!active}
      aria-label={active ? "Handwriting area" : undefined}
      style={fixed ? { position: "fixed" } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    />
  );
}

/** Floating pencil palette, shown while Pencil Mode is on. */
export function InkPalette() {
  const { pencil, setPencil, store, planner, date, toast } = useCanvas();
  const t = useTools();
  if (!pencil) return null;

  const undo = () => {
    const op = undoStack.pop();
    if (!op) return;
    for (const id of op.ids) {
      if (op.kind === "add") store.remove("canvas_ink", id);
      else store.restore("canvas_ink", id);
    }
    redoStack.push(op);
  };
  const redo = () => {
    const op = redoStack.pop();
    if (!op) return;
    for (const id of op.ids) {
      if (op.kind === "add") store.restore("canvas_ink", id);
      else store.remove("canvas_ink", id);
    }
    undoStack.push(op);
  };
  const clear = () => {
    const ids = store.all("canvas_ink").filter((s) => s.date === date && (t.target === "page" ? s.zone === "page" : s.zone !== "page")).map((s) => s.id);
    if (!ids.length) return;
    if (!window.confirm(t.target === "page" ? "Clear the page drawing for this day?" : "Clear all section handwriting for this day?")) return;
    ids.forEach((id) => store.remove("canvas_ink", id));
    undoStack.push({ kind: "erase", ids });
    toast("Handwriting cleared", { label: "Undo", run: undo });
  };
  void planner;

  const btn = (on: boolean) => `dc-icon-btn ${on ? "" : ""}`;
  return (
    <div
      role="toolbar"
      aria-label="Pencil tools"
      className="dc-noprint fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl px-2 py-1.5 shadow-xl md:bottom-6"
      style={{ background: "var(--dc-paper)", border: "1px solid var(--dc-line)", maxWidth: "calc(100vw - 1rem)" }}
    >
      <button className={btn(t.tool === "pen")} aria-pressed={t.tool === "pen"} aria-label="Pen" onClick={() => setTools({ tool: "pen" })}>
        <PenLine size={17} />
      </button>
      <button className={btn(t.tool === "highlighter")} aria-pressed={t.tool === "highlighter"} aria-label="Highlighter" onClick={() => setTools({ tool: "highlighter", color: t.tool === "highlighter" ? t.color : "#e0b83a" })}>
        <Highlighter size={17} />
      </button>
      <button className={btn(t.tool === "eraser")} aria-pressed={t.tool === "eraser"} aria-label="Eraser" onClick={() => setTools({ tool: "eraser" })}>
        <Eraser size={17} />
      </button>
      <span className="mx-1 h-6 w-px" style={{ background: "var(--dc-line)" }} />
      {(t.tool === "highlighter" ? ["#e0b83a", "#9fd08a", "#f2a1b5", "#9cc4f0"] : INK_COLORS).map((c) => (
        <button
          key={c}
          aria-label={`Ink colour ${c}`}
          aria-pressed={t.color === c}
          onClick={() => setTools({ color: c, tool: t.tool === "eraser" ? "pen" : t.tool })}
          className="h-6 w-6 rounded-full"
          style={{ background: c, boxShadow: t.color === c ? "0 0 0 2px var(--dc-paper), 0 0 0 4px var(--dc-ink)" : "inset 0 0 0 1px rgba(0,0,0,.15)" }}
        />
      ))}
      <span className="mx-1 h-6 w-px" style={{ background: "var(--dc-line)" }} />
      {[1.4, 2.4, 4].map((w) => (
        <button key={w} className="dc-icon-btn sm" aria-label={`Line ${w < 2 ? "fine" : w < 3 ? "medium" : "bold"}`} aria-pressed={t.width === w} onClick={() => setTools({ width: w })}>
          <span className="rounded-full" style={{ width: w * 2.2 + 2, height: w * 2.2 + 2, background: "currentColor" }} />
        </button>
      ))}
      <span className="mx-1 h-6 w-px" style={{ background: "var(--dc-line)" }} />
      <button className="dc-icon-btn" aria-label="Undo" onClick={undo}>
        <Undo2 size={17} />
      </button>
      <button className="dc-icon-btn" aria-label="Redo" onClick={redo}>
        <Redo2 size={17} />
      </button>
      <button className="dc-icon-btn" aria-label="Clear handwriting" onClick={clear}>
        <Trash2 size={17} />
      </button>
      <button className="dc-icon-btn" aria-label={t.target === "page" ? "Draw on sections" : "Draw across the whole page"} aria-pressed={t.target === "page"} title={t.target === "page" ? "Drawing across the page" : "Drawing in sections"} onClick={() => setTools({ target: t.target === "page" ? "sections" : "page" })}>
        {t.target === "page" ? <Square size={17} /> : <LayoutGrid size={17} />}
      </button>
      <button className="dc-icon-btn" aria-label="Allow finger drawing" aria-pressed={t.finger} title="Draw with a finger too (turn off for palm rejection)" onClick={() => setTools({ finger: !t.finger })}>
        <Hand size={17} />
      </button>
      <button className="dc-icon-btn" aria-label="Exit Pencil Mode" onClick={() => setPencil(false)}>
        <X size={17} />
      </button>
    </div>
  );
}
