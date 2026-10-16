import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  previewEnd,
  reconcileSelection,
  selectionReducer,
  type RangeSelection,
} from "./rangeSelection";

// Ten 30-minute slots; slot 6 is booked.
const selectable = [
  true,
  true,
  true,
  true,
  true,
  true,
  false,
  true,
  true,
  true,
];
const pick = (
  state: RangeSelection,
  index: number,
  spaceKey = "studio-6",
  maxSlots = 16
) =>
  selectionReducer(state, {
    type: "pick",
    spaceKey,
    index,
    selectable,
    maxSlots,
  });

describe("time range selection", () => {
  it("selects a start, then an end", () => {
    const started = pick(EMPTY_SELECTION, 1);
    expect(started).toMatchObject({
      startIndex: 1,
      endIndex: null,
      notice: { kind: "pick_end" },
    });
    expect(pick(started, 3)).toEqual({
      spaceKey: "studio-6",
      startIndex: 1,
      endIndex: 3,
      notice: null,
    });
  });

  it("moves the start when the end is earlier than the start", () => {
    expect(pick(pick(EMPTY_SELECTION, 4), 2)).toMatchObject({
      startIndex: 2,
      endIndex: null,
      notice: { kind: "end_before_start" },
    });
  });

  it("clears when the start is clicked again", () => {
    expect(pick(pick(EMPTY_SELECTION, 4), 4)).toEqual(EMPTY_SELECTION);
  });

  it("refuses ranges that cross unavailable time", () => {
    expect(pick(pick(EMPTY_SELECTION, 4), 8)).toMatchObject({
      startIndex: 4,
      endIndex: null,
      notice: { kind: "range_blocked", firstBlockedIndex: 6 },
    });
  });

  it("refuses ranges longer than the maximum", () => {
    expect(
      pick(pick(EMPTY_SELECTION, 0, "studio-6", 3), 3, "studio-6", 3)
    ).toMatchObject({
      endIndex: null,
      notice: { kind: "too_long" },
    });
  });

  it("starts over in another studio, and after a finished range", () => {
    const done = pick(pick(EMPTY_SELECTION, 1), 2);
    expect(pick(done, 5, "studio-7")).toMatchObject({
      spaceKey: "studio-7",
      startIndex: 5,
      endIndex: null,
    });
    expect(pick(done, 0)).toMatchObject({
      spaceKey: "studio-6",
      startIndex: 0,
      endIndex: null,
    });
  });

  it("ignores unavailable slots", () => {
    const started = pick(EMPTY_SELECTION, 1);
    expect(pick(started, 6)).toBe(started);
  });

  it("previews up to the hovered slot, stopping before unavailable time", () => {
    const started = pick(EMPTY_SELECTION, 3);
    expect(previewEnd(started, "studio-6", 5, selectable, 16)).toBe(5);
    expect(previewEnd(started, "studio-6", 9, selectable, 16)).toBe(5);
    expect(previewEnd(started, "studio-6", 2, selectable, 16)).toBeNull();
    expect(previewEnd(started, "studio-7", 5, selectable, 16)).toBeNull();
  });

  it("drops selections that became unavailable", () => {
    const done = pick(pick(EMPTY_SELECTION, 4), 5);
    const now = selectable.map((value, index) => (index === 5 ? false : value));
    expect(reconcileSelection(done, "studio-6", now)).toEqual(EMPTY_SELECTION);
    expect(reconcileSelection(done, "studio-6", selectable)).toBe(done);
  });
});
