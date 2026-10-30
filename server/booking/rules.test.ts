import { describe, expect, it } from "vitest";
import {
  BookingError,
  buildSlots,
  displayRange,
  evaluateOccurrence,
  expandItem,
  expandItems,
  findInternalOverlaps,
} from "./rules";

// 2026-10-15 12:07 in Montreal.
const NOW = new Date("2026-10-15T16:07:00Z");
const OPEN = { opening: [{ start: 540, end: 1320 }], busy: [] };

describe("expandItem", () => {
  it("expands a weekly series", () => {
    const occurrences = expandItem(
      {
        studioIds: [7, 6],
        audience: "private",
        date: "2026-10-15",
        startTime: "10:00",
        endTime: "12:00",
        weeks: 3,
      },
      0
    );
    expect(occurrences.map(o => o.date)).toEqual([
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
    ]);
    expect(occurrences[0]).toMatchObject({
      studioIds: [6, 7],
      start: 600,
      end: 720,
    });
  });

  it("rejects malformed requests", () => {
    const base = {
      studioIds: [1],
      audience: "private" as const,
      date: "2026-10-16",
      startTime: "10:00",
      endTime: "11:00",
      weeks: 1,
    };
    expect(() => expandItem({ ...base, endTime: "10:30" }, 0)).toThrow(
      BookingError
    );
    expect(() => expandItem({ ...base, startTime: "10:15" }, 0)).toThrow(
      BookingError
    );
    expect(() => expandItem({ ...base, endTime: "19:00" }, 0)).toThrow(
      BookingError
    );
    expect(() => expandItem({ ...base, weeks: 5 }, 0)).toThrow(BookingError);
    expect(() => expandItem({ ...base, studioIds: [1, 2, 3] }, 0)).toThrow(
      BookingError
    );
    expect(() => expandItem({ ...base, date: "2026-02-30" }, 0)).toThrow(
      BookingError
    );
    expect(() =>
      expandItem({ ...base, audience: "vip" as unknown as "group" }, 0)
    ).toThrow(BookingError);
  });

  it("caps the size of an order", () => {
    const item = {
      studioIds: [1],
      audience: "private" as const,
      date: "2026-10-16",
      startTime: "10:00",
      endTime: "11:00",
      weeks: 4,
    };
    expect(() => expandItems(Array.from({ length: 7 }, () => item))).toThrow(
      BookingError
    );
  });
});

describe("evaluateOccurrence", () => {
  const at = (date: string, start: number, end: number) => ({
    itemIndex: 0,
    studioIds: [1],
    audience: "private",
    date,
    start,
    end,
  });

  it("accepts open, free, future time", () => {
    expect(
      evaluateOccurrence(at("2026-10-15", 750, 810), OPEN, NOW)
    ).toBeNull();
  });

  it("rejects times that have started", () => {
    expect(evaluateOccurrence(at("2026-10-15", 720, 780), OPEN, NOW)).toBe(
      "past"
    );
    expect(evaluateOccurrence(at("2026-10-14", 750, 810), OPEN, NOW)).toBe(
      "past"
    );
  });

  it("rejects closed and booked time", () => {
    expect(evaluateOccurrence(at("2026-10-16", 480, 600), OPEN, NOW)).toBe(
      "closed"
    );
    expect(
      evaluateOccurrence(
        at("2026-10-16", 600, 720),
        {
          ...OPEN,
          busy: [{ start: 690, end: 750 }],
        },
        NOW
      )
    ).toBe("booked");
    // Touching a booking is fine.
    expect(
      evaluateOccurrence(
        at("2026-10-16", 600, 690),
        {
          ...OPEN,
          busy: [{ start: 690, end: 750 }],
        },
        NOW
      )
    ).toBeNull();
  });

  it("books at most 30 days ahead, weekly repeats included", () => {
    // NOW is October 15: November 14 is the 30th day.
    expect(
      evaluateOccurrence(at("2026-11-14", 600, 660), OPEN, NOW)
    ).toBeNull();
    expect(evaluateOccurrence(at("2026-11-15", 600, 660), OPEN, NOW)).toBe(
      "too_far"
    );
    // The third week of a series that starts on November 1.
    expect(evaluateOccurrence(at("2026-11-22", 600, 660), OPEN, NOW)).toBe(
      "too_far"
    );
  });
});

describe("findInternalOverlaps", () => {
  it("flags overlapping occurrences that share a studio", () => {
    const overlaps = findInternalOverlaps([
      {
        itemIndex: 0,
        studioIds: [6, 7],
        date: "2026-10-16",
        start: 600,
        end: 720,
      },
      {
        itemIndex: 1,
        studioIds: [7],
        date: "2026-10-16",
        start: 660,
        end: 780,
      },
      {
        itemIndex: 2,
        studioIds: [5],
        date: "2026-10-16",
        start: 660,
        end: 780,
      },
      {
        itemIndex: 3,
        studioIds: [7],
        date: "2026-10-23",
        start: 660,
        end: 780,
      },
    ]);
    expect([...overlaps]).toEqual([1]);
  });
});

describe("buildSlots", () => {
  it("marks closed, past, booked and available cells", () => {
    const slots = buildSlots(
      { opening: [{ start: 600, end: 780 }], busy: [{ start: 690, end: 720 }] },
      { start: 540, end: 810 },
      660
    );
    expect(slots).toEqual([
      "closed", // 9:00
      "closed", // 9:30
      "past", // 10:00
      "past", // 10:30
      "past", // 11:00 (starts at the current minute)
      "booked", // 11:30
      "available", // 12:00
      "available", // 12:30
      "closed", // 13:00
    ]);
  });

  it("spans whole hours around the opening hours", () => {
    expect(displayRange([{ start: 570, end: 1290 }])).toEqual({
      start: 540,
      end: 1320,
    });
    expect(displayRange([])).toEqual({ start: 540, end: 1320 });
  });
});
