/**
 * Booking rules and calendar helpers shared by the server and the browser.
 * Every time value is Montreal wall-clock time ("HH:MM"), and every date is a
 * "YYYY-MM-DD" key in the studio's time zone.
 */

export const STUDIO_TIME_ZONE = "America/Toronto";
export const SLOT_MINUTES = 30;
export const MIN_BOOKING_MINUTES = 60;
export const MAX_BOOKING_MINUTES = 8 * 60;
/** How far ahead a first rental date can be chosen. */
export const BOOKING_WINDOW_DAYS = 60;
export const MAX_REPEAT_WEEKS = 4;
/** Weekly repeats may extend past the booking window by up to three weeks. */
export const LAST_BOOKABLE_DAY =
  BOOKING_WINDOW_DAYS + 7 * (MAX_REPEAT_WEEKS - 1);
export const MAX_CART_ITEMS = 10;
export const MAX_ORDER_OCCURRENCES = 24;
export const DAY_MINUTES = 24 * 60;

export type Audience = "private" | "group";
export type SlotStatus = "available" | "booked" | "closed" | "past";
export type ClassLevel = "beginner" | "intermediate" | "advanced" | "open";
export const CLASS_LEVELS: readonly ClassLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "open",
];

export type Interval = { start: number; end: number };

/** Why a requested date and time cannot be booked. */
export type OccurrenceProblem =
  | "invalid"
  | "past"
  | "too_far"
  | "closed"
  | "booked"
  | "overlap";

export type RentalItemInput = {
  studioIds: number[];
  /** Private or group rate, chosen per booking. */
  audience: Audience;
  date: string;
  startTime: string;
  endTime: string;
  weeks: number;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isDateKey(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** "09:30" → 570. "24:00" is accepted as the end of the day. */
export function timeToMinutes(value: string): number {
  if (!isTime(value)) throw new RangeError(`Invalid time: ${value}`);
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 570 → "09:30". 1440 → "24:00". */
export function minutesToTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > DAY_MINUTES) {
    throw new RangeError(`Invalid minute of day: ${value}`);
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addDays(dateKey: string, amount: number): string {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, matching PostgreSQL's dayOfWeek columns. */
export function dayOfWeek(dateKey: string): number {
  return dateFromKey(dateKey).getUTCDay();
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (dateFromKey(toKey).getTime() - dateFromKey(fromKey).getTime()) / DAY_MS
  );
}

/** Noon UTC on the date: safe to format with timeZone "UTC" in any locale. */
export function dateKeyToDate(dateKey: string): Date {
  return dateFromKey(dateKey);
}

/** The current date and minute of day in the studio's time zone. */
export function studioNow(now: Date = new Date()): {
  dateKey: string;
  minutes: number;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: STUDIO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Dates of a weekly series starting on `dateKey`. */
export function seriesDates(dateKey: string, weeks: number): string[] {
  return Array.from({ length: weeks }, (_, index) =>
    addDays(dateKey, index * 7)
  );
}

/** Price in cents for `minutes` at an hourly rate in cents. */
export function priceForMinutes(
  hourlyRateCents: number,
  minutes: number
): number {
  return Math.round((hourlyRateCents * minutes) / 60);
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

export function mergeIntervals(values: readonly Interval[]): Interval[] {
  const sorted = values
    .filter(value => value.end > value.start)
    .map(value => ({ ...value }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const value of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || value.start > previous.end) merged.push(value);
    else previous.end = Math.max(previous.end, value.end);
  }
  return merged;
}

export function intersectIntervals(
  left: readonly Interval[],
  right: readonly Interval[]
): Interval[] {
  const a = mergeIntervals(left);
  const b = mergeIntervals(right);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (end > start) result.push({ start, end });
    if (a[i].end <= b[j].end) i += 1;
    else j += 1;
  }
  return result;
}

export function isContained(
  interval: Interval,
  windows: readonly Interval[]
): boolean {
  return mergeIntervals(windows).some(
    window => interval.start >= window.start && interval.end <= window.end
  );
}
