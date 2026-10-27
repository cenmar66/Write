import { describe, expect, it } from "vitest";
import { interpret } from "@/lib/canvas/parse";

const opts = { today: "2026-10-27", now: new Date(2026, 9, 27, 10, 0) };

describe("quick capture parsing", () => {
  it("call John tomorrow morning about the proposal", () => {
    const c = interpret("Call John tomorrow morning about the proposal", opts);
    expect(c).toMatchObject({ kind: "task", section: "comms", contactName: "John", date: "2026-10-28" });
    expect(c.title).toBe("Call John about the proposal");
  });

  it("add buy batteries to my shopping list", () => {
    expect(interpret("Add buy batteries to my shopping list.", opts)).toMatchObject({ kind: "task", section: "shopping", title: "Batteries" });
    expect(interpret("buy 2 lemons", opts)).toMatchObject({ section: "shopping", title: "Lemons", quantity: "2" });
  });

  it("schedule a client meeting Friday at two", () => {
    expect(interpret("Schedule a client meeting Friday at two", opts)).toMatchObject({
      kind: "appointment",
      title: "Client meeting",
      date: "2026-10-30",
      time: "14:00",
    });
  });

  it("add this to my big ideas", () => {
    expect(interpret("Add this to my big ideas: a book about the psychology of discipline", opts)).toMatchObject({
      kind: "idea",
      title: "A book about the psychology of discipline",
    });
  });

  it("logs exercise and water", () => {
    expect(interpret("played tennis for 90 minutes", opts)).toMatchObject({ kind: "exercise", title: "Tennis", durationMin: 90 });
    expect(interpret("drank two glasses of water", opts)).toMatchObject({ kind: "water", glasses: 2 });
  });

  it("understands Spanish", () => {
    expect(interpret("Llamar a Ana mañana a las 3", opts)).toMatchObject({ section: "comms", contactName: "Ana", date: "2026-10-28", time: "15:00" });
    expect(interpret("comprar pan", opts)).toMatchObject({ section: "shopping", title: "Pan" });
  });

  it("never discards text it doesn't understand", () => {
    const c = interpret("purple elephants dancing", opts);
    expect(c).toMatchObject({ kind: "task", confidence: "low", title: "Purple elephants dancing", transcript: "purple elephants dancing" });
    expect(interpret("", opts).title).toBe("");
  });
});
