import { ENV } from "./_core/env";
import { getSqlClient } from "./db";
import { toPostgresTimestamp } from "./databaseValues";
import {
  assertSupportedStudioCombination,
  BookingError,
  calculateLineTotal,
  dateKeyFromMarker,
  getEarliestStartTime,
  HOLD_GRACE_MINUTES,
  intersectManySegments,
  MAX_BOOKING_MINUTES,
  MIN_BOOKING_MINUTES,
  intervalIsContained,
  mergeSegments,
  normalizeStudioIds,
  SLOT_STEP_MINUTES,
  STUDIO_TIME_ZONE,
  type BookingAudience,
  type TimeSegment,
  validateBookingDate,
  validateBookingWindow,
} from "./bookingPolicy";

type SqlExecutor = any;

type StudioRow = {
  id: number;
  name: string;
  description: string | null;
  capacity: number | null;
  size: string | null;
  hourlyRate: number;
  groupHourlyRate: number | null;
  imageUrl: string | null;
};

type TimeSlotRow = {
  studioId: number;
  startTime: string;
  endTime: string;
};

type BusyRow = {
  startTime: string;
  endTime: string;
};

type ReservationRow = {
  id: string;
  status: "checkout_pending" | "paid" | "expired" | "cancelled";
  amountTotal: number;
  currency: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  cancelTokenHash: string;
  holdExpiresAt: Date;
};

type SummaryRow = {
  reservationId: string;
  reservationStatus: "checkout_pending" | "paid" | "expired" | "cancelled";
  amountTotal: number;
  currency: string;
  audience: BookingAudience;
  bookingDate: Date;
  startTime: string;
  endTime: string;
  studioId: number;
  studioName: string;
};

export type PublicStudio = StudioRow;

export type StudioPriceLine = {
  studioId: number;
  studioName: string;
  hourlyRate: number;
  lineTotal: number;
};

export type BookingSchedule = {
  date: string;
  studios: PublicStudio[];
  availability: TimeSegment[];
  busy: TimeSegment[];
  earliestStartTime: string | null;
  currency: string;
  rules: {
    stepMinutes: number;
    minimumMinutes: number;
    maximumMinutes: number;
    timeZone: string;
  };
};

export type ReservationSummary = {
  reservationId: string;
  status: "checkout_pending" | "paid" | "expired" | "cancelled";
  date: string;
  startTime: string;
  endTime: string;
  studioIds: number[];
  studioNames: string[];
  amountTotal: number;
  currency: string;
  audience: BookingAudience;
};

export type CreateHoldInput = {
  id: string;
  studioIds: number[];
  date: string;
  startTime: string;
  endTime: string;
  audience: BookingAudience;
  userName: string;
  userEmail: string;
  userPhone?: string;
  specialRequests?: string;
  currency: string;
  cancelTokenHash: string;
  sessionExpiresAt: Date;
};

export type CreatedHold = {
  id: string;
  status: "checkout_pending";
  date: string;
  startTime: string;
  endTime: string;
  audience: BookingAudience;
  amountTotal: number;
  currency: string;
  lines: StudioPriceLine[];
  sessionExpiresAt: Date;
  holdExpiresAt: Date;
};


async function expireStaleReservations(sql: SqlExecutor): Promise<void> {
  await sql`
    WITH expired AS (
      UPDATE reservations
      SET status = 'expired', "updatedAt" = NOW()
      WHERE status = 'checkout_pending'
        AND "holdExpiresAt" <= NOW()
      RETURNING id
    )
    UPDATE bookings AS b
    SET status = 'cancelled', "updatedAt" = NOW()
    WHERE b."reservationId" IN (SELECT id FROM expired)
      AND b.status = 'pending'
  `;
}

async function loadStudios(
  sql: SqlExecutor,
  studioIds: number[]
): Promise<StudioRow[]> {
  const rows = (await sql`
    SELECT
      id,
      name,
      description,
      capacity,
      size,
      "hourlyRate",
      "groupHourlyRate",
      "imageUrl"
    FROM studios
    WHERE id IN ${sql(studioIds)}
      AND "isActive" = TRUE
    ORDER BY id
  `) as unknown as StudioRow[];

  if (rows.length !== studioIds.length) {
    throw new BookingError("NOT_FOUND", "One or more selected studios are unavailable.");
  }

  return rows;
}

async function loadAvailability(
  sql: SqlExecutor,
  studioIds: number[],
  dayOfWeek: number
): Promise<TimeSegment[]> {
  const rows = (await sql`
    SELECT "studioId", "startTime", "endTime"
    FROM "timeSlots"
    WHERE "studioId" IN ${sql(studioIds)}
      AND "dayOfWeek" = ${dayOfWeek}
      AND "isAvailable" = TRUE
    ORDER BY "studioId", "startTime"
  `) as unknown as TimeSlotRow[];

  const byStudio = studioIds.map(studioId =>
    rows
      .filter(row => row.studioId === studioId)
      .map(row => ({ startTime: row.startTime, endTime: row.endTime }))
  );

  return intersectManySegments(byStudio);
}

async function loadBusyIntervals(
  sql: SqlExecutor,
  studioIds: number[],
  date: string
): Promise<TimeSegment[]> {
  const rows = (await sql`
    SELECT b."startTime", b."endTime"
    FROM bookings AS b
    LEFT JOIN reservations AS r ON r.id = b."reservationId"
    WHERE b."studioId" IN ${sql(studioIds)}
      AND b."bookingDate" >= ${date}::date
      AND b."bookingDate" < ${date}::date + INTERVAL '1 day'
      AND (
        b.status = 'confirmed'
        OR (
          b.status = 'pending'
          AND (
            b."reservationId" IS NULL
            OR r.status = 'paid'
            OR (
              r.status = 'checkout_pending'
              AND r."holdExpiresAt" > NOW()
            )
          )
        )
      )
    ORDER BY b."startTime"
  `) as unknown as BusyRow[];

  return mergeSegments(rows);
}

async function buildSchedule(
  sql: SqlExecutor,
  studioIds: number[],
  date: string,
  now: Date = new Date()
): Promise<BookingSchedule> {
  const normalizedIds = normalizeStudioIds(studioIds);
  const { dayOfWeek } = validateBookingDate(date, now);

  await expireStaleReservations(sql);
  const studios = await loadStudios(sql, normalizedIds);
  assertSupportedStudioCombination(studios.map(studio => studio.name));
  const [availability, busy] = await Promise.all([
    loadAvailability(sql, normalizedIds, dayOfWeek),
    loadBusyIntervals(sql, normalizedIds, date),
  ]);

  return {
    date,
    studios,
    availability,
    busy,
    earliestStartTime: getEarliestStartTime(date, now),
    currency: ENV.stripeCurrency,
    rules: {
      stepMinutes: SLOT_STEP_MINUTES,
      minimumMinutes: MIN_BOOKING_MINUTES,
      maximumMinutes: MAX_BOOKING_MINUTES,
      timeZone: STUDIO_TIME_ZONE,
    },
  };
}

export async function getBookingSchedule(input: {
  studioIds: number[];
  date: string;
}): Promise<BookingSchedule> {
  return buildSchedule(getSqlClient(), input.studioIds, input.date);
}

export async function createReservationHold(
  input: CreateHoldInput
): Promise<CreatedHold> {
  const studioIds = normalizeStudioIds(input.studioIds);
  const window = validateBookingWindow(input);
  const holdExpiresAt = new Date(
    input.sessionExpiresAt.getTime() + HOLD_GRACE_MINUTES * 60 * 1000
  );
  const holdExpiresAtSql = toPostgresTimestamp(holdExpiresAt);
  const client = getSqlClient();

  return client.begin(async transaction => {
    const sql = transaction as unknown as SqlExecutor;

    for (const studioId of studioIds) {
      const lockKey = `studio-booking:${input.date}:${studioId}`;
      await sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;
    }

    await expireStaleReservations(sql);
    const studios = await loadStudios(sql, studioIds);
    assertSupportedStudioCombination(studios.map(studio => studio.name));
    const availability = await loadAvailability(sql, studioIds, window.dayOfWeek);

    if (!intervalIsContained(input.startTime, input.endTime, availability)) {
      throw new BookingError(
        "CONFLICT",
        "The selected time is outside the studios' available hours."
      );
    }

    const conflicts = (await sql`
      SELECT b.id
      FROM bookings AS b
      LEFT JOIN reservations AS r ON r.id = b."reservationId"
      WHERE b."studioId" IN ${sql(studioIds)}
        AND b."bookingDate" >= ${input.date}::date
        AND b."bookingDate" < ${input.date}::date + INTERVAL '1 day'
        AND b."startTime" < ${input.endTime}
        AND b."endTime" > ${input.startTime}
        AND (
          b.status = 'confirmed'
          OR (
            b.status = 'pending'
            AND (
              b."reservationId" IS NULL
              OR r.status = 'paid'
              OR (
                r.status = 'checkout_pending'
                AND r."holdExpiresAt" > NOW()
              )
            )
          )
        )
      LIMIT 1
      FOR UPDATE OF b
    `) as unknown as Array<{ id: number }>;

    if (conflicts.length > 0) {
      throw new BookingError(
        "CONFLICT",
        "That time was just reserved. Please choose another time."
      );
    }

    const lines: StudioPriceLine[] = studios.map(studio => {
      const hourlyRate =
        input.audience === "group"
          ? studio.groupHourlyRate ?? studio.hourlyRate
          : studio.hourlyRate;
      return {
        studioId: studio.id,
        studioName: studio.name,
        hourlyRate,
        lineTotal: calculateLineTotal(hourlyRate, window.durationMinutes),
      };
    });
    const amountTotal = lines.reduce((total, line) => total + line.lineTotal, 0);

    await sql`
      INSERT INTO reservations (
        id,
        "userName",
        "userEmail",
        "userPhone",
        audience,
        "specialRequests",
        "amountTotal",
        currency,
        status,
        "cancelTokenHash",
        "holdExpiresAt",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${input.id},
        ${input.userName},
        ${input.userEmail},
        ${input.userPhone ?? null},
        ${input.audience},
        ${input.specialRequests ?? null},
        ${amountTotal},
        ${input.currency},
        'checkout_pending',
        ${input.cancelTokenHash},
        ${holdExpiresAtSql}::timestamptz,
        NOW(),
        NOW()
      )
    `;

    for (const line of lines) {
      await sql`
        INSERT INTO bookings (
          "reservationId",
          "studioId",
          "userName",
          "userEmail",
          "userPhone",
          "bookingDate",
          "startTime",
          "endTime",
          duration,
          "totalPrice",
          status,
          "specialRequests",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${input.id},
          ${line.studioId},
          ${input.userName},
          ${input.userEmail},
          ${input.userPhone ?? null},
          ${input.date}::date + TIME '12:00',
          ${input.startTime},
          ${input.endTime},
          ${window.durationMinutes},
          ${line.lineTotal},
          'pending',
          ${input.specialRequests ?? null},
          NOW(),
          NOW()
        )
      `;
    }

    return {
      id: input.id,
      status: "checkout_pending" as const,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      audience: input.audience,
      amountTotal,
      currency: input.currency,
      lines,
      sessionExpiresAt: input.sessionExpiresAt,
      holdExpiresAt,
    };
  });
}

export async function attachCheckoutSession(
  reservationId: string,
  checkoutSessionId: string
): Promise<void> {
  const rows = await getSqlClient()`
    UPDATE reservations
    SET
      "stripeCheckoutSessionId" = ${checkoutSessionId},
      "updatedAt" = NOW()
    WHERE id = ${reservationId}
      AND status = 'checkout_pending'
      AND (
        "stripeCheckoutSessionId" IS NULL
        OR "stripeCheckoutSessionId" = ${checkoutSessionId}
      )
    RETURNING id
  `;

  if (rows.length !== 1) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "The reservation hold is no longer available."
    );
  }
}

export async function releaseReservationHold(
  reservationId: string,
  finalStatus: "cancelled" | "expired" = "cancelled"
): Promise<void> {
  await getSqlClient().begin(async transaction => {
    const sql = transaction as unknown as SqlExecutor;
    await sql`
      UPDATE reservations
      SET status = ${finalStatus}, "updatedAt" = NOW()
      WHERE id = ${reservationId}
        AND status = 'checkout_pending'
    `;
    await sql`
      UPDATE bookings
      SET status = 'cancelled', "updatedAt" = NOW()
      WHERE "reservationId" = ${reservationId}
        AND status = 'pending'
        AND EXISTS (
          SELECT 1
          FROM reservations
          WHERE id = ${reservationId}
            AND status = ${finalStatus}
        )
    `;
  });
}

export async function getReservationForCancellation(
  reservationId: string
): Promise<ReservationRow | undefined> {
  const rows = (await getSqlClient()`
    SELECT
      id,
      status,
      "amountTotal",
      currency,
      "stripeCheckoutSessionId",
      "stripePaymentIntentId",
      "cancelTokenHash",
      "holdExpiresAt"
    FROM reservations
    WHERE id = ${reservationId}
    LIMIT 1
  `) as unknown as ReservationRow[];
  return rows[0];
}

async function summaryByReservationId(
  sql: SqlExecutor,
  reservationId: string
): Promise<ReservationSummary> {
  const rows = (await sql`
    SELECT
      r.id AS "reservationId",
      r.status AS "reservationStatus",
      r."amountTotal",
      r.currency,
      r.audience,
      b."bookingDate",
      b."startTime",
      b."endTime",
      s.id AS "studioId",
      s.name AS "studioName"
    FROM reservations AS r
    JOIN bookings AS b ON b."reservationId" = r.id
    JOIN studios AS s ON s.id = b."studioId"
    WHERE r.id = ${reservationId}
    ORDER BY s.id
  `) as unknown as SummaryRow[];

  if (rows.length === 0) {
    throw new BookingError("NOT_FOUND", "Reservation not found.");
  }

  const first = rows[0];
  return {
    reservationId: first.reservationId,
    status: first.reservationStatus,
    date: dateKeyFromMarker(first.bookingDate),
    startTime: first.startTime,
    endTime: first.endTime,
    studioIds: rows.map(row => row.studioId),
    studioNames: rows.map(row => row.studioName),
    amountTotal: first.amountTotal,
    currency: first.currency,
    audience: first.audience,
  };
}

export async function getReservationSummary(
  reservationId: string
): Promise<ReservationSummary> {
  return summaryByReservationId(getSqlClient(), reservationId);
}

export async function markReservationPaid(input: {
  reservationId: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  amountTotal: number;
  currency: string;
}): Promise<ReservationSummary> {
  const client = getSqlClient();

  return client.begin(async transaction => {
    const sql = transaction as unknown as SqlExecutor;
    const rows = (await sql`
      SELECT
        id,
        status,
        "amountTotal",
        currency,
        "stripeCheckoutSessionId",
        "stripePaymentIntentId",
        "cancelTokenHash",
        "holdExpiresAt"
      FROM reservations
      WHERE id = ${input.reservationId}
      FOR UPDATE
    `) as unknown as ReservationRow[];
    const reservation = rows[0];

    if (!reservation) {
      throw new BookingError("NOT_FOUND", "Reservation not found.");
    }
    if (
      reservation.stripeCheckoutSessionId &&
      reservation.stripeCheckoutSessionId !== input.checkoutSessionId
    ) {
      throw new BookingError(
        "PRECONDITION_FAILED",
        "Checkout session does not match the reservation."
      );
    }
    if (
      reservation.amountTotal !== input.amountTotal ||
      reservation.currency.toLowerCase() !== input.currency.toLowerCase()
    ) {
      throw new BookingError(
        "PRECONDITION_FAILED",
        "Stripe payment amount does not match the reservation."
      );
    }

    if (reservation.status !== "paid") {
      await sql`
        UPDATE reservations
        SET
          status = 'paid',
          "stripeCheckoutSessionId" = ${input.checkoutSessionId},
          "stripePaymentIntentId" = ${input.paymentIntentId},
          "paidAt" = NOW(),
          "updatedAt" = NOW()
        WHERE id = ${input.reservationId}
      `;
      await sql`
        UPDATE bookings
        SET status = 'confirmed', "updatedAt" = NOW()
        WHERE "reservationId" = ${input.reservationId}
      `;
    }

    return summaryByReservationId(sql, input.reservationId);
  });
}

export async function expireReservationBySession(
  checkoutSessionId: string
): Promise<void> {
  const client = getSqlClient();
  await client.begin(async transaction => {
    const sql = transaction as unknown as SqlExecutor;
    const rows = (await sql`
      UPDATE reservations
      SET status = 'expired', "updatedAt" = NOW()
      WHERE "stripeCheckoutSessionId" = ${checkoutSessionId}
        AND status = 'checkout_pending'
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    for (const row of rows) {
      await sql`
        UPDATE bookings
        SET status = 'cancelled', "updatedAt" = NOW()
        WHERE "reservationId" = ${row.id}
          AND status = 'pending'
      `;
    }
  });
}
