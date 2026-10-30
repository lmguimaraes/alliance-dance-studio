import { describe, expect, it } from "vitest";
import {
  classesOn,
  groupByStartTime,
  hasFilters,
  nextClassDate,
  NO_FILTERS,
  runsOn,
  upcomingDates,
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

describe("drop-in dates", () => {
  // 2026-10-27 is a Tuesday.
  const tuesday = klass({
    dayOfWeek: 2,
    startTime: "19:00",
    endsOn: "2026-11-17",
  });

  it("lists the class's dates until the session ends", () => {
    expect(
      upcomingDates(tuesday, { dateKey: "2026-10-26", minutes: 600 })
    ).toEqual(["2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17"]);
  });

  it("keeps today's class until it starts", () => {
    expect(
      upcomingDates(tuesday, { dateKey: "2026-10-27", minutes: 18 * 60 })[0]
    ).toBe("2026-10-27");
    expect(
      upcomingDates(tuesday, { dateKey: "2026-10-27", minutes: 19 * 60 })[0]
    ).toBe("2026-11-03");
  });

  it("stops at the end of the schedule", () => {
    const open = klass({ dayOfWeek: 2, startTime: "19:00" });
    expect(
      upcomingDates(open, { dateKey: "2026-10-26", minutes: 0 }, 14)
    ).toEqual(["2026-10-27", "2026-11-03"]);
  });
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
        style: "Bachata",
      }).map(c => c.id)
    ).toEqual([2]);
    expect(
      classesOn(classes, "2026-10-19", { ...NO_FILTERS, level: "advanced" })
    ).toEqual([]);
  });

  it("searches title, style, teacher, studio and translated level", () => {
    const classes = [
      klass({ id: 1, title: "Salsa On1", instructorName: "Ana Pérez" }),
      klass({
        id: 2,
        title: "Bachata Sensual",
        style: "Bachata",
        level: "intermediate",
        instructorName: "Leo",
        studioName: "Studio 5",
      }),
    ];
    const ids = (search: string) =>
      classesOn(classes, "2026-10-19", { ...NO_FILTERS, search }, level =>
        level === "intermediate" ? "Intermédiaire" : "Débutant"
      ).map(c => c.id);
    expect(ids("perez")).toEqual([1]);
    expect(ids("  BACHATA  studio 5 ")).toEqual([2]);
    expect(ids("intermediaire")).toEqual([2]);
    expect(ids("leo salsa")).toEqual([]);
    expect(hasFilters({ ...NO_FILTERS, search: "   " })).toBe(false);
  });

  it("groups classes that start at the same time", () => {
    const groups = groupByStartTime([
      klass({ id: 1, startTime: "18:00" }),
      klass({ id: 2, startTime: "18:00" }),
      klass({ id: 3, startTime: "19:30" }),
    ]);
    expect(groups.map(group => [group.startTime, group.items.length])).toEqual([
      ["18:00", 2],
      ["19:30", 1],
    ]);
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
