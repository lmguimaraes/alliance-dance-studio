/**
 * Start/end selection on a studio's time grid, in the spirit of a flight
 * date picker: the first click picks the start slot, the second the end slot.
 * Only one studio can hold a selection at a time.
 */

export type SelectionNotice =
  | { kind: "pick_end" }
  | { kind: "end_before_start" }
  | { kind: "range_blocked"; firstBlockedIndex: number }
  | { kind: "too_long" };

export type RangeSelection = {
  spaceKey: string | null;
  startIndex: number | null;
  endIndex: number | null;
  notice: SelectionNotice | null;
};

export const EMPTY_SELECTION: RangeSelection = {
  spaceKey: null,
  startIndex: null,
  endIndex: null,
  notice: null,
};

export type SelectionAction =
  | {
      type: "pick";
      spaceKey: string;
      index: number;
      /** Whether each slot of this studio can be booked right now. */
      selectable: readonly boolean[];
      maxSlots: number;
    }
  | { type: "clear" };

export function selectionReducer(
  state: RangeSelection,
  action: SelectionAction
): RangeSelection {
  if (action.type === "clear") return EMPTY_SELECTION;

  const { spaceKey, index, selectable, maxSlots } = action;
  if (!selectable[index]) return state;

  const startOver: RangeSelection = {
    spaceKey,
    startIndex: index,
    endIndex: null,
    notice: { kind: "pick_end" },
  };

  // A different studio, no start yet, or a finished range: begin again.
  if (
    state.spaceKey !== spaceKey ||
    state.startIndex === null ||
    state.endIndex !== null
  ) {
    return startOver;
  }

  const start = state.startIndex;
  if (index === start) return EMPTY_SELECTION;
  if (index < start)
    return { ...startOver, notice: { kind: "end_before_start" } };

  const firstBlockedIndex = firstBlocked(selectable, start, index);
  if (firstBlockedIndex !== null) {
    return { ...state, notice: { kind: "range_blocked", firstBlockedIndex } };
  }
  if (index - start + 1 > maxSlots) {
    return { ...state, notice: { kind: "too_long" } };
  }
  return { spaceKey, startIndex: start, endIndex: index, notice: null };
}

function firstBlocked(
  selectable: readonly boolean[],
  from: number,
  to: number
): number | null {
  for (let index = from; index <= to; index += 1) {
    if (!selectable[index]) return index;
  }
  return null;
}

/** The slot a hover preview should end on, or null when there is nothing to preview. */
export function previewEnd(
  state: RangeSelection,
  spaceKey: string,
  hoverIndex: number | null,
  selectable: readonly boolean[],
  maxSlots: number
): number | null {
  if (
    hoverIndex === null ||
    state.spaceKey !== spaceKey ||
    state.startIndex === null ||
    state.endIndex !== null ||
    hoverIndex <= state.startIndex
  ) {
    return null;
  }
  const limit = Math.min(hoverIndex, state.startIndex + maxSlots - 1);
  let end = state.startIndex;
  for (let index = state.startIndex + 1; index <= limit; index += 1) {
    if (!selectable[index]) break;
    end = index;
  }
  return end > state.startIndex ? end : null;
}

/** Drops a selection whose slots are no longer bookable (for example after a refresh). */
export function reconcileSelection(
  state: RangeSelection,
  spaceKey: string,
  selectable: readonly boolean[]
): RangeSelection {
  if (state.spaceKey !== spaceKey || state.startIndex === null) return state;
  const end = state.endIndex ?? state.startIndex;
  return firstBlocked(selectable, state.startIndex, end) === null
    ? state
    : EMPTY_SELECTION;
}
