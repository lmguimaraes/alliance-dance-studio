import { describe, expect, it } from "vitest";
import {
  addDays,
  dayOfWeek,
  daysBetween,
  intersectIntervals,
  isContained,
  isDateKey,
  mergeIntervals,
  minutesToTime,
  priceForMinutes,
  seriesDates,
  studioNow,
  timeToMinutes,
} from "./booking";

describe("calendar helpers", () => {
  it("converts between times and minutes, including midnight as an end", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("24:00")).toBe(1440);
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(1440)).toBe("24:00");
    expect(() => timeToMinutes("9:30")).toThrow();
    expect(() => minutesToTime(1441)).toThrow();
  });

  it("validates real calendar dates", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
  });

  it("adds days across month, year and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-01", 7)).toBe("2026-11-08");
    expect(daysBetween("2026-10-15", "2026-11-12")).toBe(28);
  });

  it("builds weekly series on the same weekday", () => {
    const dates = seriesDates("2026-10-15", 4);
    expect(dates).toEqual([
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
      "2026-11-05",
    ]);
    expect(new Set(dates.map(dayOfWeek))).toEqual(new Set([4]));
  });

  it("reads the Montreal clock", () => {
    // 2026-10-16 03:30 UTC is 23:30 on October 15 in Montreal (EDT).
    expect(studioNow(new Date("2026-10-16T03:30:00Z"))).toEqual({
      dateKey: "2026-10-15",
      minutes: 23 * 60 + 30,
    });
  });
});

describe("intervals", () => {
  it("merges touching ranges and intersects", () => {
    expect(
      mergeIntervals([
        { start: 540, end: 720 },
        { start: 720, end: 840 },
        { start: 900, end: 960 },
      ])
    ).toEqual([
      { start: 540, end: 840 },
      { start: 900, end: 960 },
    ]);
    expect(
      intersectIntervals(
        [
          { start: 540, end: 720 },
          { start: 780, end: 900 },
        ],
        [
          { start: 570, end: 660 },
          { start: 690, end: 840 },
        ]
      )
    ).toEqual([
      { start: 570, end: 660 },
      { start: 690, end: 720 },
      { start: 780, end: 840 },
    ]);
    expect(
      intersectIntervals([{ start: 540, end: 600 }], [{ start: 600, end: 660 }])
    ).toEqual([]);
  });

  it("checks containment against opening windows", () => {
    const windows = [{ start: 540, end: 1320 }];
    expect(isContained({ start: 540, end: 600 }, windows)).toBe(true);
    expect(isContained({ start: 510, end: 600 }, windows)).toBe(false);
  });

  it("prices partial hours to the cent", () => {
    expect(priceForMinutes(1500, 90)).toBe(2250);
    expect(priceForMinutes(2200, 60)).toBe(2200);
  });
});
