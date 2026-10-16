import {
  addDays,
  dayOfWeek,
  DAY_MINUTES,
  intersectIntervals,
  isTime,
  mergeIntervals,
  STUDIO_TIME_ZONE,
  timeToMinutes,
  type Interval,
} from "../../shared/booking";
import {
  getStudioXMembers,
  isStudioXCombination,
  STUDIO_X_NAME,
  uniqueStudiosByName,
} from "../../shared/studioCatalog";
import type { SqlExecutor } from "../db";
import { BookingError, type SpaceDayFacts } from "./rules";

export type StudioRow = {
  id: number;
  name: string;
  capacity: number | null;
  size: string | null;
  hourlyRate: number;
  groupHourlyRate: number;
  imageUrl: string | null;
};

/** A bookable space: one studio, or Studio 6 and Studio 7 together. */
export type Space = {
  key: string;
  studioIds: number[];
  name: string;
  isCombination: boolean;
  capacity: number | null;
  size: string | null;
  hourlyRate: number;
  groupHourlyRate: number;
};

type OpeningByStudio = Map<number, Map<number, Interval[]>>;
type BusyByDate = Map<string, Map<number, Interval[]>>;

export type DayFacts = {
  opening: OpeningByStudio;
  busy: BusyByDate;
};

export async function loadActiveStudios(
  sql: SqlExecutor
): Promise<StudioRow[]> {
  const rows = await sql<StudioRow[]>`
    SELECT
      id,
      name,
      capacity,
      size,
      "hourlyRate",
      COALESCE("groupHourlyRate", "hourlyRate") AS "groupHourlyRate",
      COALESCE(NULLIF("imageUrl", ''), NULLIF(image, '')) AS "imageUrl"
    FROM studios
    WHERE "isActive" = TRUE
    ORDER BY id
  `;
  return uniqueStudiosByName(rows.map(row => ({ ...row })));
}

export function spaceKey(studioIds: readonly number[]): string {
  const ids = [...studioIds].sort((a, b) => a - b);
  return ids.length === 1 ? `studio-${ids[0]}` : `combo-${ids.join("-")}`;
}

function singleSpace(studio: StudioRow): Space {
  return {
    key: spaceKey([studio.id]),
    studioIds: [studio.id],
    name: studio.name,
    isCombination: false,
    capacity: studio.capacity,
    size: studio.size,
    hourlyRate: studio.hourlyRate,
    groupHourlyRate: studio.groupHourlyRate,
  };
}

/** Every bookable space, in display order. */
export function listSpaces(studios: readonly StudioRow[]): Space[] {
  const spaces = studios.map(singleSpace);
  const members = getStudioXMembers(studios);
  if (members) {
    const [first, second] = members;
    spaces.push({
      key: spaceKey([first.id, second.id]),
      studioIds: [first.id, second.id].sort((a, b) => a - b),
      name: STUDIO_X_NAME,
      isCombination: true,
      capacity:
        first.capacity != null && second.capacity != null
          ? first.capacity + second.capacity
          : null,
      size: null,
      hourlyRate: first.hourlyRate + second.hourlyRate,
      groupHourlyRate: first.groupHourlyRate + second.groupHourlyRate,
    });
  }
  return spaces;
}

/** Resolves requested studio IDs to an active space, or throws. */
export function resolveSpace(
  studios: readonly StudioRow[],
  studioIds: readonly number[]
): Space {
  const rows = studioIds.map(id => studios.find(studio => studio.id === id));
  if (rows.some(row => !row)) {
    throw new BookingError(
      "NOT_FOUND",
      "One or more selected studios are unavailable."
    );
  }
  const found = rows as StudioRow[];
  if (found.length === 1) return singleSpace(found[0]);
  if (!isStudioXCombination(found.map(studio => studio.name))) {
    throw new BookingError(
      "BAD_REQUEST",
      "Only Studio 6 and Studio 7 can be booked together."
    );
  }
  const combination = listSpaces(studios).find(space => space.isCombination);
  if (!combination) {
    throw new BookingError("NOT_FOUND", "The combined studio is unavailable.");
  }
  return combination;
}

async function loadOpening(
  sql: SqlExecutor,
  studioIds: readonly number[]
): Promise<OpeningByStudio> {
  const rows = await sql<
    {
      studioId: number;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }[]
  >`
    SELECT "studioId", "dayOfWeek", "startTime", "endTime"
    FROM "timeSlots"
    WHERE "studioId" IN ${sql(studioIds as number[])}
      AND "isAvailable" = TRUE
  `;

  const opening: OpeningByStudio = new Map();
  for (const row of rows) {
    if (row.dayOfWeek < 0 || row.dayOfWeek > 6) continue;
    if (
      !isTime(row.startTime) ||
      !isTime(row.endTime) ||
      row.startTime === "24:00"
    )
      continue;
    const start = timeToMinutes(row.startTime);
    const end = timeToMinutes(row.endTime);
    if (end <= start) continue;
    const days = opening.get(row.studioId) ?? new Map<number, Interval[]>();
    days.set(row.dayOfWeek, [
      ...(days.get(row.dayOfWeek) ?? []),
      { start, end },
    ]);
    opening.set(row.studioId, days);
  }
  return opening;
}

/** Wall-clock date and minute of an instant in the studio's time zone. */
export function studioClock(instant: Date): {
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
      .formatToParts(instant)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** The part of [startAt, endAt) that falls on `dateKey`, in minutes of day. */
export function clipToDate(
  startAt: Date,
  endAt: Date,
  dateKey: string
): Interval | null {
  const start = studioClock(startAt);
  const end = studioClock(endAt);
  if (start.dateKey > dateKey || end.dateKey < dateKey) return null;
  const clipped = {
    start: start.dateKey < dateKey ? 0 : start.minutes,
    end: end.dateKey > dateKey ? DAY_MINUTES : end.minutes,
  };
  return clipped.end > clipped.start ? clipped : null;
}

function addBusy(
  busy: BusyByDate,
  date: string,
  studioId: number,
  interval: Interval
) {
  const byStudio = busy.get(date) ?? new Map<number, Interval[]>();
  byStudio.set(studioId, [...(byStudio.get(studioId) ?? []), interval]);
  busy.set(date, byStudio);
}

/**
 * Busy time for the studios on the given dates: paid or held reservations,
 * staff bookings, active legacy bookings, and classes assigned to a studio.
 */
async function loadBusy(
  sql: SqlExecutor,
  studioIds: readonly number[],
  dates: readonly string[],
  options: { excludeBookingId?: number } = {}
): Promise<BusyByDate> {
  const busy: BusyByDate = new Map();
  if (!dates.length || !studioIds.length) return busy;

  const sortedDates = [...dates].sort();
  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];
  const wanted = new Set(dates);
  const ids = studioIds as number[];
  const excludeId = options.excludeBookingId ?? 0;

  const [bookingRows, legacyRows, classRows] = await Promise.all([
    sql<
      { studioId: number; date: string; startTime: string; endTime: string }[]
    >`
      SELECT
        b."studioId",
        to_char(b."bookingDate", 'YYYY-MM-DD') AS date,
        b."startTime",
        b."endTime"
      FROM bookings AS b
      LEFT JOIN reservations AS r ON r.id = b."reservationId"
      WHERE b."studioId" IN ${sql(ids)}
        AND b."bookingDate" >= ${firstDate}::date
        AND b."bookingDate" < ${lastDate}::date + 1
        AND b.id <> ${excludeId}
        AND (
          b.status = 'confirmed'
          OR (
            b.status = 'pending'
            AND (
              b."reservationId" IS NULL
              OR r.status = 'paid'
              OR (r.status = 'checkout_pending' AND r."holdExpiresAt" > NOW())
            )
          )
        )
    `,
    sql<{ studioId: number; startAt: Date; endAt: Date }[]>`
      SELECT i.studio_id AS "studioId", i.start_at AS "startAt", i.end_at AS "endAt"
      FROM studio_booking_items AS i
      JOIN studio_booking_groups AS g ON g.id = i.booking_group_id
      WHERE i.is_active IS TRUE
        AND i.studio_id IN ${sql(ids)}
        AND i.start_at < (${addDays(lastDate, 2)}::date)::timestamptz
        AND i.end_at > (${addDays(firstDate, -1)}::date)::timestamptz
        AND (
          g.status IN ('paid', 'scheduled')
          OR (
            g.status = 'awaiting_payment_method'
            AND COALESCE(g.checkout_expires_at, g.charge_at) > NOW()
          )
        )
    `,
    sql<
      {
        studioId: number;
        dayOfWeek: number;
        startMinute: number;
        durationMinutes: number;
        startsOn: string | null;
        endsOn: string | null;
      }[]
    >`
      SELECT
        studio_id AS "studioId",
        day_of_week AS "dayOfWeek",
        (EXTRACT(HOUR FROM start_time) * 60 + EXTRACT(MINUTE FROM start_time))::int AS "startMinute",
        duration_minutes AS "durationMinutes",
        to_char(starts_on, 'YYYY-MM-DD') AS "startsOn",
        to_char(ends_on, 'YYYY-MM-DD') AS "endsOn"
      FROM classes
      WHERE is_active IS TRUE
        AND studio_id IN ${sql(ids)}
    `,
  ]);

  for (const row of bookingRows) {
    if (!wanted.has(row.date)) continue;
    if (!isTime(row.startTime) || !isTime(row.endTime)) continue;
    const start = timeToMinutes(row.startTime);
    const end = timeToMinutes(row.endTime);
    if (end > start) addBusy(busy, row.date, row.studioId, { start, end });
  }

  for (const row of legacyRows) {
    for (const date of wanted) {
      const interval = clipToDate(
        new Date(row.startAt),
        new Date(row.endAt),
        date
      );
      if (interval) addBusy(busy, date, row.studioId, interval);
    }
  }

  for (const row of classRows) {
    for (const date of wanted) {
      if (dayOfWeek(date) !== row.dayOfWeek) continue;
      if (row.startsOn && date < row.startsOn) continue;
      if (row.endsOn && date > row.endsOn) continue;
      addBusy(busy, date, row.studioId, {
        start: row.startMinute,
        end: Math.min(DAY_MINUTES, row.startMinute + row.durationMinutes),
      });
    }
  }

  return busy;
}

export async function loadDayFacts(
  sql: SqlExecutor,
  studioIds: readonly number[],
  dates: readonly string[],
  options: { excludeBookingId?: number } = {}
): Promise<DayFacts> {
  const [opening, busy] = await Promise.all([
    loadOpening(sql, studioIds),
    loadBusy(sql, studioIds, dates, options),
  ]);
  return { opening, busy };
}

/** Opening hours shared by every member studio, and their combined busy time. */
export function factsForSpace(
  facts: DayFacts,
  studioIds: readonly number[],
  date: string
): SpaceDayFacts {
  const weekday = dayOfWeek(date);
  const openings = studioIds.map(id =>
    mergeIntervals(facts.opening.get(id)?.get(weekday) ?? [])
  );
  const opening = openings
    .slice(1)
    .reduce(
      (current, next) => intersectIntervals(current, next),
      openings[0] ?? []
    );
  const busy = mergeIntervals(
    studioIds.flatMap(id => facts.busy.get(date)?.get(id) ?? [])
  );
  return { opening, busy };
}
