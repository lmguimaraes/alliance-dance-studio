import { describe, expect, it } from "vitest";
import { intersectIntervals } from "./availability";

describe("Studio X availability", () => {
  it("keeps only time available in both Studio 6 and Studio 7", () => {
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
  });

  it("returns no availability when the rooms do not overlap", () => {
    expect(
      intersectIntervals(
        [{ start: 540, end: 600 }],
        [{ start: 600, end: 660 }]
      )
    ).toEqual([]);
  });
});
