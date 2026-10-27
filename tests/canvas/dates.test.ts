import { describe, expect, it } from "vitest";
import { addDays, diffDays, localDateOf, startOfWeek, zonedTimeToUtc, localTimeOf } from "@/lib/canvas/dates";

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("does not skip or repeat days across DST changes", () => {
    // US spring forward 2026-03-08, fall back 2026-11-01
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(diffDays("2026-11-02", "2026-10-31")).toBe(2);
  });

  it("finds the local date of an instant in a timezone (timezone boundary)", () => {
    const instant = "2026-10-28T05:30:00Z"; // 22:30 on the 27th in Los Angeles
    expect(localDateOf(instant, "America/Los_Angeles")).toBe("2026-10-27");
    expect(localDateOf(instant, "Europe/Madrid")).toBe("2026-10-28");
    expect(localDateOf(instant, "Pacific/Auckland")).toBe("2026-10-28");
  });

  it("converts a local wall time to UTC, including on DST days", () => {
    expect(zonedTimeToUtc("2026-07-01", "09:00", "America/Los_Angeles").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "09:00", "America/Los_Angeles").toISOString()).toBe("2026-12-01T17:00:00.000Z");
    // Fall-back day: 09:00 is after the change (PST, UTC-8)
    expect(zonedTimeToUtc("2026-11-01", "09:00", "America/Los_Angeles").toISOString()).toBe("2026-11-01T17:00:00.000Z");
    // Spring-forward day: 09:00 is PDT (UTC-7)
    expect(zonedTimeToUtc("2026-03-08", "09:00", "America/Los_Angeles").toISOString()).toBe("2026-03-08T16:00:00.000Z");
    expect(localTimeOf("2026-03-08T16:00:00Z", "America/Los_Angeles")).toBe("09:00");
  });

  it("weeks start on Monday", () => {
    expect(startOfWeek("2026-10-27")).toBe("2026-10-26"); // Tue -> Mon
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26"); // Sun -> Mon
  });
});
