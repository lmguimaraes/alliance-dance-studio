import { describe, expect, it } from "vitest";
import {
  classesOn,
  nextClassDate,
  NO_FILTERS,
  runsOn,
  type ScheduledClass,
} from "./classSchedule";

const klass = (overrides: Partial<ScheduledClass>): ScheduledClass => ({
  id: 1,
  title: "Salsa On1",
  style: "Salsa",
  level: "beginner",
  instructorName: "Ana",
  instructorInstagram: null,
  instructorImageUrl: null,
  studioName: null,
  dayOfWeek: 1,
  startTime: "18:00",
  durationMinutes: 60,
  startsOn: null,
  endsOn: null,
  ...overrides,
});

describe("class schedule", () => {
  it("shows weekly classes within their session dates", () => {
    // 2026-10-19 is a Monday.
    expect(runsOn(klass({}), "2026-10-19")).toBe(true);
    expect(runsOn(klass({}), "2026-10-20")).toBe(false);
    expect(runsOn(klass({ endsOn: "2026-10-12" }), "2026-10-19")).toBe(false);
    expect(runsOn(klass({ startsOn: "2026-10-26" }), "2026-10-19")).toBe(false);
  });

  it("filters and orders a day's classes", () => {
    const classes = [
      klass({ id: 1, startTime: "19:00" }),
      klass({
        id: 2,
        startTime: "18:00",
        style: "Bachata",
        instructorName: "Leo",
      }),
    ];
    expect(classesOn(classes, "2026-10-19", NO_FILTERS).map(c => c.id)).toEqual(
      [2, 1]
    );
    expect(
      classesOn(classes, "2026-10-19", {
        ...NO_FILTERS,
        instructor: "Ana",
      }).map(c => c.id)
    ).toEqual([1]);
  });

  it("finds the next day with a matching class", () => {
    const classes = [klass({ dayOfWeek: 3 })]; // Wednesdays
    expect(nextClassDate(classes, "2026-10-15", "2026-12-01", NO_FILTERS)).toBe(
      "2026-10-21"
    );
    expect(
      nextClassDate(classes, "2026-10-15", "2026-10-20", NO_FILTERS)
    ).toBeNull();
  });
});
