import { describe, expect, it } from "vitest";
import {
  assertSupportedStudioCombination,
  BookingError,
  calculateLineTotal,
  getEarliestStartTime,
  intersectManySegments,
  intervalIsContained,
  intervalIsFree,
  mergeSegments,
  normalizeStudioIds,
  timeToMinutes,
  validateBookingWindow,
} from "./bookingPolicy";

describe("booking policy", () => {
  it("merges touching ranges and intersects multi-studio availability", () => {
    expect(
      mergeSegments([
        { startTime: "09:00", endTime: "12:00" },
        { startTime: "12:00", endTime: "14:00" },
      ])
    ).toEqual([{ startTime: "09:00", endTime: "14:00" }]);

    expect(
      intersectManySegments([
        [{ startTime: "09:00", endTime: "17:00" }],
        [{ startTime: "10:00", endTime: "14:00" }],
      ])
    ).toEqual([{ startTime: "10:00", endTime: "14:00" }]);
  });

  it("uses half-open overlap rules", () => {
    const busy = [{ startTime: "11:00", endTime: "12:00" }];
    expect(intervalIsFree("10:00", "11:00", busy)).toBe(true);
    expect(intervalIsFree("10:30", "11:30", busy)).toBe(false);
    expect(intervalIsFree("12:00", "13:00", busy)).toBe(true);
  });

  it("validates Toronto-local dates, steps, and duration", () => {
    const now = new Date("2026-09-03T16:00:00.000Z"); // 12:00 in Toronto
    expect(
      validateBookingWindow({
        date: "2026-09-03",
        startTime: "12:30",
        endTime: "14:00",
        now,
      }).durationMinutes
    ).toBe(90);

    expect(() =>
      validateBookingWindow({
        date: "2026-09-03",
        startTime: "12:00",
        endTime: "13:00",
        now,
      })
    ).toThrow(BookingError);
  });

  it("finds the next 30-minute boundary", () => {
    const now = new Date("2026-09-03T16:07:00.000Z"); // 12:07 in Toronto
    expect(getEarliestStartTime("2026-09-03", now)).toBe("12:30");
  });

  it("accepts midnight only as an end boundary", () => {
    expect(timeToMinutes("24:00")).toBe(1440);
    expect(
      validateBookingWindow({
        date: "2026-09-04",
        startTime: "23:00",
        endTime: "24:00",
        now: new Date("2026-09-03T16:00:00.000Z"),
      }).durationMinutes
    ).toBe(60);
  });

  it("normalizes studio IDs and enforces the supported combination", () => {
    expect(normalizeStudioIds([7, 6, 7])).toEqual([6, 7]);
    expect(() =>
      assertSupportedStudioCombination(["Studio 7", "Studio 6"])
    ).not.toThrow();
    expect(() =>
      assertSupportedStudioCombination(["Studio 5", "Studio 6"])
    ).toThrow(BookingError);
    expect(calculateLineTotal(1500, 90)).toBe(2250);
  });

  it("requires a requested interval to fit an opening window", () => {
    const windows = [{ startTime: "09:00", endTime: "17:00" }];
    expect(intervalIsContained("09:00", "10:00", windows)).toBe(true);
    expect(intervalIsContained("08:30", "10:00", windows)).toBe(false);
  });
});
