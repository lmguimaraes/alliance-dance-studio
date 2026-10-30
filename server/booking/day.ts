import {
  addDays,
  AVAILABILITY_VIEW_DAYS,
  BOOKING_WINDOW_DAYS,
  daysBetween,
  dayOfWeek,
  isDateKey,
  MAX_BOOKING_MINUTES,
  MAX_REPEAT_WEEKS,
  MIN_BOOKING_MINUTES,
  SLOT_MINUTES,
  STUDIO_TIME_ZONE,
  studioNow,
  type Interval,
  type SlotStatus,
} from "../../shared/booking";
import { getSql } from "../db";
import {
  factsForSpace,
  listSpaces,
  loadActiveStudios,
  loadDayFacts,
} from "./facts";
import { BookingError, buildSlots, displayRange } from "./rules";

export type RentalSpace = {
  key: string;
  studioIds: number[];
  name: string;
  isCombination: boolean;
  capacity: number | null;
  size: string | null;
  hourlyRate: number;
  groupHourlyRate: number;
  /** One status per 30-minute cell from range.start to range.end. */
  slots: SlotStatus[];
};

export type RentalDay = {
  date: string;
  today: string;
  timeZone: string;
  currency: string;
  range: Interval;
  rules: {
    stepMinutes: number;
    minimumMinutes: number;
    maximumMinutes: number;
    windowDays: number;
    maxWeeks: number;
  };
  /** False past the booking window: availability is shown but can't be booked. */
  bookable: boolean;
  /** The day this date enters the booking window. */
  bookingOpensOn: string;
  spaces: RentalSpace[];
};

export async function getRentalDay(
  date: string,
  currency: string,
  now: Date = new Date()
): Promise<RentalDay> {
  const today = studioNow(now);
  if (!isDateKey(date)) {
    throw new BookingError(
      "BAD_REQUEST",
      "Dates must use the YYYY-MM-DD format."
    );
  }
  const daysAhead = daysBetween(today.dateKey, date);
  // Availability can be viewed further ahead than it can be booked.
  if (daysAhead < 0 || daysAhead > AVAILABILITY_VIEW_DAYS) {
    throw new BookingError(
      "BAD_REQUEST",
      `Choose a date from today through the next ${AVAILABILITY_VIEW_DAYS} days.`
    );
  }

  const sql = getSql();
  const studios = await loadActiveStudios(sql);
  const spaces = listSpaces(studios);
  const facts = await loadDayFacts(
    sql,
    studios.map(studio => studio.id),
    [date]
  );

  const weekday = dayOfWeek(date);
  const allOpenings = studios.flatMap(
    studio => facts.opening.get(studio.id)?.get(weekday) ?? []
  );
  const range = displayRange(allOpenings);
  const pastBefore = daysAhead === 0 ? today.minutes : null;

  return {
    date,
    today: today.dateKey,
    timeZone: STUDIO_TIME_ZONE,
    currency,
    range,
    rules: {
      stepMinutes: SLOT_MINUTES,
      minimumMinutes: MIN_BOOKING_MINUTES,
      maximumMinutes: MAX_BOOKING_MINUTES,
      windowDays: BOOKING_WINDOW_DAYS,
      maxWeeks: MAX_REPEAT_WEEKS,
    },
    bookable: daysAhead <= BOOKING_WINDOW_DAYS,
    bookingOpensOn: addDays(date, -BOOKING_WINDOW_DAYS),
    spaces: spaces.map(space => ({
      ...space,
      slots: buildSlots(
        factsForSpace(facts, space.studioIds, date),
        range,
        pastBefore
      ),
    })),
  };
}
