export const STUDIO_TIME_ZONE = "America/Toronto";
export const SLOT_STEP_MINUTES = 30;
export const MIN_BOOKING_MINUTES = 60;
export const MAX_BOOKING_MINUTES = 8 * 60;
export const MAX_ADVANCE_DAYS = 60;
export const CHECKOUT_SESSION_MINUTES = 31;
export const HOLD_GRACE_MINUTES = 10;

export type BookingAudience = "private" | "group";

export type TimeSegment = {
  startTime: string;
  endTime: string;
};

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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function timeToMinutes(value: string): number {
  if (!TIME_PATTERN.test(value)) {
    throw new BookingError("BAD_REQUEST", "Time must use the HH:MM format.");
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) {
    throw new BookingError("BAD_REQUEST", "Time is outside the supported range.");
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function parseDateKey(dateKey: string): Date {
  if (!DATE_PATTERN.test(dateKey)) {
    throw new BookingError("BAD_REQUEST", "Date must use the YYYY-MM-DD format.");
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BookingError("BAD_REQUEST", "The selected date is invalid.");
  }

  return date;
}

export function dateKeyFromMarker(date: Date | string): string {
  const marker = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(marker.getTime())) {
    throw new BookingError("INTERNAL_SERVER_ERROR", "Stored booking date is invalid.");
  }
  return marker.toISOString().slice(0, 10);
}

export function getZonedNow(
  now: Date = new Date(),
  timeZone = STUDIO_TIME_ZONE
): { dateKey: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  const dateKey = `${values.year}-${values.month}-${values.day}`;
  const hours = Number(values.hour);
  const minutes = Number(values.minute);

  if (!DATE_PATTERN.test(dateKey) || !Number.isFinite(hours + minutes)) {
    throw new BookingError(
      "INTERNAL_SERVER_ERROR",
      "Unable to resolve the studio time zone."
    );
  }

  return { dateKey, minutes: hours * 60 + minutes };
}

export function getEarliestStartTime(
  dateKey: string,
  now: Date = new Date()
): string | null {
  parseDateKey(dateKey);
  const zoned = getZonedNow(now);
  if (dateKey !== zoned.dateKey) return null;

  const nextStep =
    Math.ceil((zoned.minutes + 1) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
  return nextStep <= 24 * 60 ? minutesToTime(nextStep) : "24:00";
}

function calendarDayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function validateBookingDate(
  date: string,
  now: Date = new Date()
): { bookingDate: Date; dayOfWeek: number; dayDifference: number } {
  const bookingDate = parseDateKey(date);
  const zonedNow = getZonedNow(now);
  const dayDifference =
    calendarDayNumber(date) - calendarDayNumber(zonedNow.dateKey);

  if (dayDifference < 0) {
    throw new BookingError("BAD_REQUEST", "Past dates cannot be reserved.");
  }
  if (dayDifference > MAX_ADVANCE_DAYS) {
    throw new BookingError(
      "BAD_REQUEST",
      `Reservations can be made up to ${MAX_ADVANCE_DAYS} days in advance.`
    );
  }

  return {
    bookingDate,
    dayOfWeek: bookingDate.getUTCDay(),
    dayDifference,
  };
}

export function validateBookingWindow(input: {
  date: string;
  startTime: string;
  endTime: string;
  now?: Date;
}): {
  date: string;
  bookingDate: Date;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
} {
  const now = input.now ?? new Date();
  const { bookingDate, dayOfWeek, dayDifference } = validateBookingDate(
    input.date,
    now
  );
  const startMinutes = timeToMinutes(input.startTime);
  const endMinutes = timeToMinutes(input.endTime);

  if (
    startMinutes % SLOT_STEP_MINUTES !== 0 ||
    endMinutes % SLOT_STEP_MINUTES !== 0
  ) {
    throw new BookingError(
      "BAD_REQUEST",
      `Bookings must start and end on ${SLOT_STEP_MINUTES}-minute boundaries.`
    );
  }

  const durationMinutes = endMinutes - startMinutes;
  if (durationMinutes < MIN_BOOKING_MINUTES) {
    throw new BookingError(
      "BAD_REQUEST",
      `The minimum reservation is ${MIN_BOOKING_MINUTES} minutes.`
    );
  }
  if (durationMinutes > MAX_BOOKING_MINUTES) {
    throw new BookingError(
      "BAD_REQUEST",
      `The maximum reservation is ${MAX_BOOKING_MINUTES / 60} hours.`
    );
  }

  const zonedNow = getZonedNow(now);
  if (dayDifference === 0 && startMinutes <= zonedNow.minutes) {
    throw new BookingError("BAD_REQUEST", "The selected time has already passed.");
  }

  return {
    date: input.date,
    bookingDate,
    dayOfWeek,
    startMinutes,
    endMinutes,
    durationMinutes,
  };
}

export function normalizeStudioIds(studioIds: readonly number[]): number[] {
  const normalized = Array.from(new Set(studioIds)).sort((a, b) => a - b);

  if (
    normalized.length < 1 ||
    normalized.length > 2 ||
    normalized.some(id => !Number.isInteger(id) || id <= 0)
  ) {
    throw new BookingError(
      "BAD_REQUEST",
      "Choose one studio, or the supported two-studio combination."
    );
  }

  return normalized;
}

export function assertSupportedStudioCombination(
  studioNames: readonly string[]
): void {
  if (studioNames.length <= 1) return;

  const normalized = studioNames
    .map(name => name.trim().toLowerCase())
    .sort()
    .join("|");

  if (normalized !== "studio 6|studio 7") {
    throw new BookingError(
      "BAD_REQUEST",
      "Only Studio 6 and Studio 7 can be reserved as a combined space."
    );
  }
}

export function mergeSegments(segments: readonly TimeSegment[]): TimeSegment[] {
  const sorted = segments
    .map(segment => ({
      startTime: minutesToTime(timeToMinutes(segment.startTime)),
      endTime: minutesToTime(timeToMinutes(segment.endTime)),
    }))
    .filter(segment => timeToMinutes(segment.endTime) > timeToMinutes(segment.startTime))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const merged: TimeSegment[] = [];
  for (const segment of sorted) {
    const previous = merged.at(-1);
    if (!previous || timeToMinutes(segment.startTime) > timeToMinutes(previous.endTime)) {
      merged.push({ ...segment });
      continue;
    }

    if (timeToMinutes(segment.endTime) > timeToMinutes(previous.endTime)) {
      previous.endTime = segment.endTime;
    }
  }

  return merged;
}

export function intersectSegments(
  left: readonly TimeSegment[],
  right: readonly TimeSegment[]
): TimeSegment[] {
  const a = mergeSegments(left);
  const b = mergeSegments(right);
  const result: TimeSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const start = Math.max(
      timeToMinutes(a[i].startTime),
      timeToMinutes(b[j].startTime)
    );
    const end = Math.min(
      timeToMinutes(a[i].endTime),
      timeToMinutes(b[j].endTime)
    );

    if (end > start) {
      result.push({ startTime: minutesToTime(start), endTime: minutesToTime(end) });
    }

    if (timeToMinutes(a[i].endTime) < timeToMinutes(b[j].endTime)) i += 1;
    else j += 1;
  }

  return mergeSegments(result);
}

export function intersectManySegments(
  segmentGroups: readonly (readonly TimeSegment[])[]
): TimeSegment[] {
  if (segmentGroups.length === 0) return [];

  return segmentGroups
    .slice(1)
    .reduce<TimeSegment[]>(
      (current, next) => intersectSegments(current, next),
      mergeSegments(segmentGroups[0])
    );
}

export function intervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return timeToMinutes(startA) < timeToMinutes(endB) &&
    timeToMinutes(endA) > timeToMinutes(startB);
}

export function intervalIsContained(
  startTime: string,
  endTime: string,
  availability: readonly TimeSegment[]
): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  return mergeSegments(availability).some(
    segment =>
      start >= timeToMinutes(segment.startTime) &&
      end <= timeToMinutes(segment.endTime)
  );
}

export function intervalIsFree(
  startTime: string,
  endTime: string,
  busy: readonly TimeSegment[]
): boolean {
  return !busy.some(segment =>
    intervalsOverlap(startTime, endTime, segment.startTime, segment.endTime)
  );
}

export function calculateLineTotal(
  hourlyRate: number,
  durationMinutes: number
): number {
  if (!Number.isInteger(hourlyRate) || hourlyRate <= 0) {
    throw new BookingError("INTERNAL_SERVER_ERROR", "Studio rate is invalid.");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new BookingError("BAD_REQUEST", "Booking duration is invalid.");
  }

  return Math.round((hourlyRate * durationMinutes) / 60);
}
