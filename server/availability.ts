import { Router } from "express";
import { Pool, type QueryResultRow } from "pg";
import { uniqueStudiosByName } from "../shared/studioCatalog";

import { MAX_ADVANCE_DAYS } from "./bookingPolicy";

const TIME_ZONE = "America/Toronto";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE_STEP = 30;
const ACTIVE_PAYMENT_STATUSES = ["paid", "scheduled"] as const;

type Interval = { start: number; end: number };
type SegmentStatus = "available" | "booked" | "closed" | "past";
type Segment = Interval & { status: SegmentStatus };
type StudioRow = QueryResultRow & {
  id: number;
  name: string;
  description: string | null;
  capacity: number;
  size: string;
  hourly_rate_cents: number;
  group_hourly_rate_cents: number;
  image_url: string | null;
};
type ScheduleRow = QueryResultRow & { studio_id: number; start_minute: number; end_minute: number };
type BusyRow = QueryResultRow & { studio_id: number; start_time: string; end_time: string };

let pool: Pool | undefined;
function database(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Database is not configured");
  pool ??= new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  return pool;
}

function zonedDateParts(date = new Date()): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
}

function todayInToronto(): string {
  const parts = zonedDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentMinuteInToronto(): number {
  const parts = zonedDateParts();
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function dateOffset(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(value: string): number {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

function timeToMinute(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return null;
  if (value === "24:00") return 1440;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function mergeIntervals(values: Interval[]): Interval[] {
  const sorted = values
    .filter((value) => Number.isFinite(value.start) && Number.isFinite(value.end) && value.start < value.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const value of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || value.start > previous.end) merged.push({ ...value });
    else previous.end = Math.max(previous.end, value.end);
  }
  return merged;
}

function contains(intervals: Interval[], start: number, end: number): boolean {
  return intervals.some((interval) => start >= interval.start && end <= interval.end);
}

function overlaps(intervals: Interval[], start: number, end: number): boolean {
  return intervals.some((interval) => start < interval.end && end > interval.start);
}

function buildSegments(
  openingHours: Interval[],
  busy: Interval[],
  range: Interval,
  pastBefore: number | null,
): Segment[] {
  const boundaries = new Set<number>([range.start, range.end]);
  for (const interval of [...openingHours, ...busy]) {
    boundaries.add(Math.max(range.start, Math.min(range.end, interval.start)));
    boundaries.add(Math.max(range.start, Math.min(range.end, interval.end)));
  }
  const pastCutoff =
    pastBefore === null
      ? null
      : Math.ceil(
          pastBefore / MINUTE_STEP
        ) * MINUTE_STEP;

  if (
    pastCutoff !== null &&
    pastCutoff > range.start &&
    pastCutoff < range.end
  ) {
    boundaries.add(pastCutoff);
  }

  const points = Array.from(boundaries).sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === end) continue;
    const open = contains(openingHours, start, end);
    const status: SegmentStatus = !open
      ? "closed"
      : pastCutoff !== null && end <= pastCutoff
        ? "past"
        : overlaps(busy, start, end)
          ? "booked"
          : "available";
    const previous = segments[segments.length - 1];
    if (previous?.status === status && previous.end === start) previous.end = end;
    else segments.push({ start, end, status });
  }
  return segments;
}

function availableWindows(segments: Segment[]): Interval[] {
  return segments
    .filter((segment) => segment.status === "available")
    .map(({ start, end }) => ({ start, end }))
    .filter((interval) => interval.end - interval.start >= MINUTE_STEP);
}

export const studioAvailabilityRouter = Router();

studioAvailabilityRouter.get("/", async (request, response) => {
  const today = todayInToronto();
  const rawDate = Array.isArray(request.query.date) ? request.query.date[0] : request.query.date;
  const date = typeof rawDate === "string" && rawDate.length ? rawDate : today;

  if (!isRealDate(date)) {
    response.status(400).json({ error: "Use a valid date in YYYY-MM-DD format." });
    return;
  }
  if (date < today || date > dateOffset(today, MAX_ADVANCE_DAYS)) {
    response.status(400).json({
      error:
        `Availability can be viewed from today through the next ${MAX_ADVANCE_DAYS} days.`,
    });

    return;
  }

  try {
    const db = database();
    const studiosResult = await db.query<StudioRow>(`
      SELECT id, name, description, capacity, size,
             hourly_rate_cents, group_hourly_rate_cents, image_url
        FROM public.alpha_studio_catalog
       WHERE is_active IS TRUE
       ORDER BY id
    `);
    const studioIds = studiosResult.rows.map((studio) => studio.id);

    if (!studioIds.length) {
      response.setHeader("Cache-Control", "no-store");
      response.json({ date, today, timeZone: TIME_ZONE, range: { start: 540, end: 1320, stepMinutes: MINUTE_STEP }, studios: [] });
      return;
    }

    const [scheduleResult, paidBusyResult, legacyBusyResult] = await Promise.all([
      db.query<ScheduleRow>(`
        SELECT studio_id, start_minute, end_minute
          FROM public.alpha_studio_schedule
         WHERE day_of_week = $1
           AND studio_id = ANY($2::integer[])
         ORDER BY studio_id, start_minute
      `, [dayOfWeek(date), studioIds]),
      db.query<BusyRow>(`
        WITH bounds AS (
          SELECT ($1::date::timestamp AT TIME ZONE $2) AS start_at,
                 (($1::date + 1)::timestamp AT TIME ZONE $2) AS end_at
        )
        SELECT i.studio_id,
               to_char(GREATEST(i.start_at, b.start_at) AT TIME ZONE $2, 'HH24:MI') AS start_time,
               to_char(LEAST(i.end_at, b.end_at) AT TIME ZONE $2, 'HH24:MI') AS end_time
          FROM public.studio_booking_items i
          JOIN public.studio_booking_groups g ON g.id = i.booking_group_id
          CROSS JOIN bounds b
         WHERE i.is_active IS TRUE
           AND i.studio_id = ANY($3::integer[])
           AND i.start_at < b.end_at
           AND i.end_at > b.start_at
           AND (
             g.status = ANY($4::text[])
             OR (
               g.status = 'awaiting_payment_method'
               AND COALESCE(g.checkout_expires_at, g.charge_at) > now()
             )
           )
      `, [date, TIME_ZONE, studioIds, [...ACTIVE_PAYMENT_STATUSES]]),
      db.query<BusyRow>(`
        SELECT "studioId" AS studio_id, "startTime" AS start_time, "endTime" AS end_time
          FROM public.bookings
         WHERE "bookingDate"::date = $1::date
           AND "studioId" = ANY($2::integer[])
           AND status::text = ANY($3::text[])
           AND "startTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
           AND "endTime" ~ '^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
      `, [date, studioIds, ["pending", "confirmed", "paid", "scheduled"]]),
    ]);

    const schedule = new Map<number, Interval[]>();
    for (const row of scheduleResult.rows) {
      const values = schedule.get(row.studio_id) ?? [];
      values.push({ start: Number(row.start_minute), end: Number(row.end_minute) });
      schedule.set(row.studio_id, values);
    }

    const busy = new Map<number, Interval[]>();
    for (const row of [...paidBusyResult.rows, ...legacyBusyResult.rows]) {
      const start = timeToMinute(row.start_time);
      const end = timeToMinute(row.end_time);
      if (start === null || end === null || end <= start) continue;
      const values = busy.get(Number(row.studio_id)) ?? [];
      values.push({ start, end });
      busy.set(Number(row.studio_id), values);
    }

    const everyOpening = Array.from(schedule.values()).flat();
    const range = everyOpening.length
      ? {
          start: Math.max(0, Math.floor(Math.min(...everyOpening.map((value) => value.start)) / 60) * 60),
          end: Math.min(1440, Math.ceil(Math.max(...everyOpening.map((value) => value.end)) / 60) * 60),
        }
      : { start: 540, end: 1320 };
    const pastBefore = date === today ? currentMinuteInToronto() : null;

    const studios = studiosResult.rows.map((studio) => {
      const openingHours = mergeIntervals(schedule.get(studio.id) ?? []);
      const occupied = mergeIntervals(busy.get(studio.id) ?? []);
      const segments = buildSegments(openingHours, occupied, range, pastBefore);
      const windows = availableWindows(segments);
      return {
        id: studio.id,
        name: studio.name,
        description: studio.description,
        capacity: studio.capacity,
        size: studio.size,
        hourlyRateCents: studio.hourly_rate_cents,
        groupHourlyRateCents: studio.group_hourly_rate_cents,
        imageUrl: studio.image_url,
        scheduleConfigured: openingHours.length > 0,
        openingHours,
        segments,
        availableWindows: windows,
        nextAvailable: windows[0] ?? null,
        availableMinutes: windows.reduce((total, window) => total + window.end - window.start, 0),
      };
    });

    response.setHeader("Cache-Control", "no-store");
    response.json({
      date,
      today,
      timeZone: TIME_ZONE,
      generatedAt: new Date().toISOString(),
      range: { ...range, stepMinutes: MINUTE_STEP },
      studios,
    });
  } catch (error) {
    console.error("[availability] unable to load studio availability", error instanceof Error ? error.message : "unknown error");
    response.status(503).json({ error: "Studio availability is temporarily unavailable. Please try again." });
  }
});
