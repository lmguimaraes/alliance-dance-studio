import {
  BOOKING_WINDOW_DAYS,
  daysBetween,
  intervalsOverlap,
  isContained,
  isDateKey,
  isTime,
  MAX_BOOKING_MINUTES,
  MAX_ORDER_OCCURRENCES,
  MAX_REPEAT_WEEKS,
  mergeIntervals,
  MIN_BOOKING_MINUTES,
  seriesDates,
  SLOT_MINUTES,
  studioNow,
  timeToMinutes,
  type Interval,
  type OccurrenceProblem,
  type RentalItemInput,
  type SlotStatus,
} from "../../shared/booking";

export type BookingErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "INTERNAL_SERVER_ERROR";

export class BookingError extends Error {
  constructor(
    public readonly code: BookingErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BookingError";
  }
}

/** One dated booking of one space (a studio, or Studio 6 + 7 together). */
export type Occurrence = {
  itemIndex: number;
  studioIds: number[];
  date: string;
  start: number;
  end: number;
};

export type SpaceDayFacts = {
  opening: Interval[];
  busy: Interval[];
};

/**
 * Checks the shape of a cart item and expands it into weekly occurrences.
 * Throws for requests a well-behaved client never sends.
 */
export function expandItem(
  item: RentalItemInput,
  itemIndex: number
): Occurrence[] {
  if (!isDateKey(item.date)) {
    throw new BookingError(
      "BAD_REQUEST",
      "Dates must use the YYYY-MM-DD format."
    );
  }
  if (
    !isTime(item.startTime) ||
    !isTime(item.endTime) ||
    item.startTime === "24:00"
  ) {
    throw new BookingError("BAD_REQUEST", "Times must use the HH:MM format.");
  }
  if (item.audience !== "private" && item.audience !== "group") {
    throw new BookingError("BAD_REQUEST", "Choose a private or group rental.");
  }
  if (
    !Number.isInteger(item.weeks) ||
    item.weeks < 1 ||
    item.weeks > MAX_REPEAT_WEEKS
  ) {
    throw new BookingError(
      "BAD_REQUEST",
      `Weekly repeats must be between 1 and ${MAX_REPEAT_WEEKS}.`
    );
  }

  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) {
    throw new BookingError(
      "BAD_REQUEST",
      `Bookings start and end on ${SLOT_MINUTES}-minute boundaries.`
    );
  }
  if (end - start < MIN_BOOKING_MINUTES) {
    throw new BookingError("BAD_REQUEST", "The minimum booking is one hour.");
  }
  if (end - start > MAX_BOOKING_MINUTES) {
    throw new BookingError(
      "BAD_REQUEST",
      `The maximum booking is ${MAX_BOOKING_MINUTES / 60} hours.`
    );
  }

  const studioIds = normalizeStudioIds(item.studioIds);
  return seriesDates(item.date, item.weeks).map(date => ({
    itemIndex,
    studioIds,
    date,
    start,
    end,
  }));
}

export function expandItems(items: readonly RentalItemInput[]): Occurrence[] {
  const occurrences = items.flatMap((item, index) => expandItem(item, index));
  if (occurrences.length > MAX_ORDER_OCCURRENCES) {
    throw new BookingError(
      "BAD_REQUEST",
      `An order can hold up to ${MAX_ORDER_OCCURRENCES} bookings.`
    );
  }
  return occurrences;
}

function normalizeStudioIds(studioIds: readonly number[]): number[] {
  const normalized = Array.from(new Set(studioIds)).sort((a, b) => a - b);
  if (
    normalized.length < 1 ||
    normalized.length > 2 ||
    normalized.some(id => !Number.isInteger(id) || id <= 0)
  ) {
    throw new BookingError(
      "BAD_REQUEST",
      "Choose one studio, or Studio 6 and Studio 7 together."
    );
  }
  return normalized;
}

/** Returns why an occurrence cannot be booked, or null when it can. */
export function evaluateOccurrence(
  occurrence: Occurrence,
  facts: SpaceDayFacts,
  now: Date = new Date()
): OccurrenceProblem | null {
  const today = studioNow(now);
  const daysAhead = daysBetween(today.dateKey, occurrence.date);

  if (daysAhead < 0) return "past";
  if (daysAhead === 0 && occurrence.start <= today.minutes) return "past";
  // Checked per date, so a weekly repeat can't reach past the window either.
  if (daysAhead > BOOKING_WINDOW_DAYS) return "too_far";

  const interval = { start: occurrence.start, end: occurrence.end };
  if (!isContained(interval, facts.opening)) return "closed";
  if (facts.busy.some(busy => intervalsOverlap(busy, interval)))
    return "booked";
  return null;
}

/** Indexes of occurrences that overlap another one in the same order. */
export function findInternalOverlaps(
  occurrences: readonly Occurrence[]
): Set<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < occurrences.length; i += 1) {
    for (let j = i + 1; j < occurrences.length; j += 1) {
      const a = occurrences[i];
      const b = occurrences[j];
      if (
        a.date === b.date &&
        a.studioIds.some(id => b.studioIds.includes(id)) &&
        intervalsOverlap(a, b)
      ) {
        overlapping.add(j);
      }
    }
  }
  return overlapping;
}

/**
 * Status of each 30-minute cell between `range.start` and `range.end`.
 * `pastBefore` is the current minute of day when the date is today.
 */
export function buildSlots(
  facts: SpaceDayFacts,
  range: Interval,
  pastBefore: number | null
): SlotStatus[] {
  const opening = mergeIntervals(facts.opening);
  const busy = mergeIntervals(facts.busy);
  const slots: SlotStatus[] = [];

  for (
    let start = range.start;
    start + SLOT_MINUTES <= range.end;
    start += SLOT_MINUTES
  ) {
    const cell = { start, end: start + SLOT_MINUTES };
    if (!isContained(cell, opening)) slots.push("closed");
    else if (pastBefore !== null && cell.start <= pastBefore)
      slots.push("past");
    else if (busy.some(interval => intervalsOverlap(interval, cell)))
      slots.push("booked");
    else slots.push("available");
  }

  return slots;
}

/** Hour-aligned span covering every opening window, or 9:00–22:00 when closed. */
export function displayRange(openings: readonly Interval[]): Interval {
  if (!openings.length) return { start: 9 * 60, end: 22 * 60 };
  const start = Math.min(...openings.map(value => value.start));
  const end = Math.max(...openings.map(value => value.end));
  return {
    start: Math.max(0, Math.floor(start / 60) * 60),
    end: Math.min(24 * 60, Math.ceil(end / 60) * 60),
  };
}
