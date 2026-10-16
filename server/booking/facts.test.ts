import { describe, expect, it } from "vitest";
import {
  clipToDate,
  factsForSpace,
  listSpaces,
  resolveSpace,
  type StudioRow,
} from "./facts";
import { BookingError } from "./rules";

const studio = (id: number, name: string): StudioRow => ({
  id,
  name,
  capacity: 20,
  size: "Medium",
  hourlyRate: 1500,
  groupHourlyRate: 2200,
  imageUrl: null,
});

describe("spaces", () => {
  const studios = [
    studio(5, "Studio 5"),
    studio(6, "Studio 6"),
    studio(7, "Studio 7"),
  ];

  it("adds Studio X when Studio 6 and Studio 7 are both active", () => {
    const spaces = listSpaces(studios);
    expect(spaces.map(space => space.key)).toEqual([
      "studio-5",
      "studio-6",
      "studio-7",
      "combo-6-7",
    ]);
    expect(spaces[3]).toMatchObject({
      name: "Studio X",
      hourlyRate: 3000,
      capacity: 40,
    });
    expect(
      listSpaces(studios.slice(0, 2)).some(space => space.isCombination)
    ).toBe(false);
  });

  it("resolves requested studios and rejects unsupported pairs", () => {
    expect(resolveSpace(studios, [6, 7]).name).toBe("Studio X");
    expect(resolveSpace(studios, [5]).name).toBe("Studio 5");
    expect(() => resolveSpace(studios, [5, 6])).toThrow(BookingError);
    expect(() => resolveSpace(studios, [9])).toThrow(BookingError);
  });
});

describe("factsForSpace", () => {
  it("intersects opening hours and unions busy time", () => {
    const facts = {
      opening: new Map([
        [6, new Map([[5, [{ start: 540, end: 1320 }]]])],
        [7, new Map([[5, [{ start: 600, end: 1200 }]]])],
      ]),
      busy: new Map([
        [
          "2026-10-16",
          new Map([
            [6, [{ start: 600, end: 660 }]],
            [7, [{ start: 900, end: 960 }]],
          ]),
        ],
      ]),
    };
    expect(factsForSpace(facts, [6, 7], "2026-10-16")).toEqual({
      opening: [{ start: 600, end: 1200 }],
      busy: [
        { start: 600, end: 660 },
        { start: 900, end: 960 },
      ],
    });
  });
});

describe("clipToDate", () => {
  it("converts instants to Montreal wall-clock minutes", () => {
    // 14:00–16:00 UTC is 10:00–12:00 in Montreal (EDT).
    expect(
      clipToDate(
        new Date("2026-10-16T14:00:00Z"),
        new Date("2026-10-16T16:00:00Z"),
        "2026-10-16"
      )
    ).toEqual({ start: 600, end: 720 });
  });

  it("clips bookings that cross midnight", () => {
    const start = new Date("2026-10-17T03:00:00Z"); // 23:00 on Oct 16
    const end = new Date("2026-10-17T05:00:00Z"); // 01:00 on Oct 17
    expect(clipToDate(start, end, "2026-10-16")).toEqual({
      start: 1380,
      end: 1440,
    });
    expect(clipToDate(start, end, "2026-10-17")).toEqual({ start: 0, end: 60 });
    expect(clipToDate(start, end, "2026-10-18")).toBeNull();
  });
});
