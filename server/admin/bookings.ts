import {
  intervalsOverlap,
  isDateKey,
  minutesToTime,
  priceForMinutes,
  studioNow,
  timeToMinutes,
  type Audience,
} from "../../shared/booking";
import { getSql, inTransaction, type SqlExecutor } from "../db";
import {
  clipToDate,
  factsForSpace,
  loadActiveStudios,
  loadDayFacts,
  resolveSpace,
} from "../booking/facts";
import { expireStaleReservations, lockStudioDates } from "../booking/orders";
import { BookingError } from "../booking/rules";

export type AdminBookingStatus = "pending" | "confirmed" | "cancelled";

export type AdminBooking = {
  key: string;
  source: "booking" | "legacy";
  id: string;
  studioId: number;
  studioName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AdminBookingStatus;
  /** Rate sold online; null for staff and legacy bookings. */
  audience: Audience | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  notes: string | null;
  totalCents: number | null;
  reservationId: string | null;
  paymentStatus: "paid" | "checkout_pending" | "expired" | "cancelled" | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
};

export type BookingRange = "upcoming" | "past" | "all";

const LIST_LIMIT = 1000;

export async function listAdminBookings(input: {
  range: BookingRange;
  status?: AdminBookingStatus;
  search?: string;
}): Promise<AdminBooking[]> {
  const sql = getSql();
  await expireStaleReservations(sql);

  const today = studioNow().dateKey;
  // Inclusive start, exclusive end, as YYYY-MM-DD keys.
  const from = input.range === "upcoming" ? today : "1900-01-01";
  const until = input.range === "past" ? today : "3000-01-01";
  const search = input.search?.trim().toLowerCase() ?? "";
  const pattern = `%${search.replace(/[\\%_]/g, character => `\\${character}`)}%`;

  const bookingRows = await sql<
    {
      id: number;
      studioId: number;
      studioName: string;
      date: string;
      startTime: string;
      endTime: string;
      status: AdminBookingStatus;
      userName: string;
      userEmail: string;
      userPhone: string | null;
      specialRequests: string | null;
      totalPrice: number;
      audience: Audience | null;
      reservationId: string | null;
      paymentStatus: AdminBooking["paymentStatus"];
      stripePaymentIntentId: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      b.id,
      b."studioId",
      COALESCE(s.name, 'Studio ' || b."studioId") AS "studioName",
      to_char(b."bookingDate", 'YYYY-MM-DD') AS date,
      b."startTime",
      b."endTime",
      b.status,
      b."userName",
      b."userEmail",
      b."userPhone",
      b."specialRequests",
      b."totalPrice",
      b.audience,
      b."reservationId",
      r.status AS "paymentStatus",
      r."stripePaymentIntentId",
      to_char(b."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt"
    FROM bookings AS b
    LEFT JOIN studios AS s ON s.id = b."studioId"
    LEFT JOIN reservations AS r ON r.id = b."reservationId"
    WHERE b."bookingDate" >= ${from}::date
      AND b."bookingDate" < ${until}::date
      AND (${input.status ?? null}::text IS NULL OR b.status::text = ${input.status ?? null})
      AND (
        ${search} = ''
        OR lower(b."userName") LIKE ${pattern}
        OR lower(b."userEmail") LIKE ${pattern}
        OR lower(COALESCE(b."reservationId", '')) LIKE ${pattern}
      )
    ORDER BY b."bookingDate" ${input.range === "past" ? sql`DESC` : sql`ASC`}, b."startTime"
    LIMIT ${LIST_LIMIT}
  `;

  const legacyRows = await sql<
    {
      id: string;
      studioId: number;
      studioName: string;
      startAt: Date;
      endAt: Date;
      isActive: boolean;
      groupStatus: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string | null;
      specialRequests: string | null;
      stripePaymentIntentId: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      i.id::text AS id,
      i.studio_id AS "studioId",
      COALESCE(s.name, 'Studio ' || i.studio_id) AS "studioName",
      i.start_at AS "startAt",
      i.end_at AS "endAt",
      i.is_active AS "isActive",
      g.status AS "groupStatus",
      g.customer_name AS "customerName",
      g.customer_email AS "customerEmail",
      g.customer_phone AS "customerPhone",
      g.special_requests AS "specialRequests",
      g.stripe_payment_intent_id AS "stripePaymentIntentId",
      to_char(i.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt"
    FROM studio_booking_items AS i
    JOIN studio_booking_groups AS g ON g.id = i.booking_group_id
    LEFT JOIN studios AS s ON s.id = i.studio_id
    WHERE i.start_at < ${until}::date + 1
      AND i.end_at >= ${from}::date - 1
    ORDER BY i.start_at
    LIMIT ${LIST_LIMIT}
  `;

  const bookings: AdminBooking[] = bookingRows.map(row => ({
    key: `booking-${row.id}`,
    source: "booking",
    id: String(row.id),
    studioId: row.studioId,
    studioName: row.studioName,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    audience: row.audience,
    customerName: row.userName,
    customerEmail: row.userEmail,
    customerPhone: row.userPhone,
    notes: row.specialRequests,
    totalCents: row.totalPrice,
    reservationId: row.reservationId,
    paymentStatus: row.paymentStatus,
    stripePaymentIntentId: row.stripePaymentIntentId,
    createdAt: row.createdAt,
  }));

  const legacy: AdminBooking[] = [];
  for (const row of legacyRows) {
    const start = new Date(row.startAt);
    const end = new Date(row.endAt);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(start);
    const interval = clipToDate(start, end, date);
    if (!interval) continue;
    if (date < from || date >= until) continue;

    const status: AdminBookingStatus = !row.isActive
      ? "cancelled"
      : row.groupStatus === "paid" || row.groupStatus === "scheduled"
        ? "confirmed"
        : row.groupStatus === "awaiting_payment_method"
          ? "pending"
          : "cancelled";
    if (input.status && status !== input.status) continue;
    if (
      search &&
      !`${row.customerName} ${row.customerEmail}`.toLowerCase().includes(search)
    ) {
      continue;
    }

    legacy.push({
      key: `legacy-${row.id}`,
      source: "legacy",
      id: row.id,
      studioId: row.studioId,
      studioName: row.studioName,
      date,
      startTime: minutesToTime(interval.start),
      endTime: minutesToTime(interval.end),
      status,
      audience: null,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      notes: row.specialRequests,
      totalCents: null,
      reservationId: null,
      paymentStatus: null,
      stripePaymentIntentId: row.stripePaymentIntentId,
      createdAt: row.createdAt,
    });
  }

  const direction = input.range === "past" ? -1 : 1;
  return [...bookings, ...legacy]
    .sort(
      (a, b) =>
        direction *
        (a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    )
    .slice(0, LIST_LIMIT);
}

export type AdminBookingInput = {
  studioIds: number[];
  date: string;
  startTime: string;
  endTime: string;
  status: AdminBookingStatus;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  notes?: string;
  /** Total for the whole booking; defaults to the private hourly rate. */
  totalCents?: number;
};

function parseWindow(input: {
  date: string;
  startTime: string;
  endTime: string;
}) {
  if (!isDateKey(input.date)) {
    throw new BookingError("BAD_REQUEST", "Choose a valid date.");
  }
  const start = timeToMinutes(input.startTime);
  const end = timeToMinutes(input.endTime);
  if (end <= start) {
    throw new BookingError(
      "BAD_REQUEST",
      "The end time must be after the start time."
    );
  }
  return { start, end };
}

async function assertNoConflict(
  sql: SqlExecutor,
  studioIds: number[],
  date: string,
  interval: { start: number; end: number },
  excludeBookingId?: number
): Promise<void> {
  const facts = await loadDayFacts(sql, studioIds, [date], {
    excludeBookingId,
  });
  const { busy } = factsForSpace(facts, studioIds, date);
  if (busy.some(value => intervalsOverlap(value, interval))) {
    throw new BookingError(
      "CONFLICT",
      "This time overlaps another booking or a class in the same studio."
    );
  }
}

export async function createAdminBooking(
  input: AdminBookingInput
): Promise<{ ids: number[] }> {
  const interval = parseWindow(input);

  return inTransaction(async sql => {
    const studios = await loadActiveStudios(sql);
    const space = resolveSpace(studios, input.studioIds);
    await lockStudioDates(
      sql,
      space.studioIds.map(studioId => ({ studioId, date: input.date }))
    );
    await expireStaleReservations(sql);
    if (input.status !== "cancelled") {
      await assertNoConflict(sql, space.studioIds, input.date, interval);
    }

    const minutes = interval.end - interval.start;
    const total =
      input.totalCents ?? priceForMinutes(space.hourlyRate, minutes);
    const ids: number[] = [];
    for (const [index, studioId] of space.studioIds.entries()) {
      // Split a combined-studio total across its rooms; the first room keeps any remainder.
      const share = Math.floor(total / space.studioIds.length);
      const amount =
        index === 0 ? total - share * (space.studioIds.length - 1) : share;
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO bookings (
          "studioId", "userName", "userEmail", "userPhone", "bookingDate",
          "startTime", "endTime", duration, "totalPrice", status,
          "specialRequests", "createdAt", "updatedAt"
        ) VALUES (
          ${studioId}, ${input.customerName}, ${input.customerEmail ?? ""},
          ${input.customerPhone ?? null}, ${input.date}::date + TIME '12:00',
          ${input.startTime}, ${input.endTime}, ${minutes}, ${amount}, ${input.status},
          ${input.notes ?? null}, NOW(), NOW()
        )
        RETURNING id
      `;
      ids.push(row.id);
    }
    return { ids };
  });
}

export type AdminBookingUpdate = {
  id: number;
  studioId: number;
  date: string;
  startTime: string;
  endTime: string;
  status: AdminBookingStatus;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  notes?: string;
  totalCents?: number;
};

export async function updateAdminBooking(
  input: AdminBookingUpdate
): Promise<void> {
  const interval = parseWindow(input);

  await inTransaction(async sql => {
    const [existing] = await sql<
      { id: number; reservationId: string | null; totalPrice: number }[]
    >`
      SELECT id, "reservationId", "totalPrice" FROM bookings WHERE id = ${input.id} FOR UPDATE
    `;
    if (!existing) throw new BookingError("NOT_FOUND", "Booking not found.");

    const studios = await loadActiveStudios(sql);
    resolveSpace(studios, [input.studioId]);
    await lockStudioDates(sql, [
      { studioId: input.studioId, date: input.date },
    ]);
    await expireStaleReservations(sql);
    if (input.status !== "cancelled") {
      await assertNoConflict(
        sql,
        [input.studioId],
        input.date,
        interval,
        input.id
      );
    }

    // Amounts of Stripe-paid bookings always match what the customer paid.
    const total = existing.reservationId
      ? existing.totalPrice
      : (input.totalCents ?? existing.totalPrice);

    await sql`
      UPDATE bookings
      SET
        "studioId" = ${input.studioId},
        "bookingDate" = ${input.date}::date + TIME '12:00',
        "startTime" = ${input.startTime},
        "endTime" = ${input.endTime},
        duration = ${interval.end - interval.start},
        status = ${input.status},
        "userName" = ${input.customerName},
        "userEmail" = ${input.customerEmail ?? ""},
        "userPhone" = ${input.customerPhone ?? null},
        "specialRequests" = ${input.notes ?? null},
        "totalPrice" = ${total},
        "updatedAt" = NOW()
      WHERE id = ${input.id}
    `;
  });
}

/**
 * Staff bookings are deleted. Paid online bookings are cancelled instead so
 * the payment record stays intact; refunds are issued from the Stripe Dashboard.
 */
export async function removeAdminBooking(
  id: number
): Promise<{ result: "deleted" | "cancelled" }> {
  return inTransaction(async sql => {
    const [existing] = await sql<{ reservationId: string | null }[]>`
      SELECT "reservationId" FROM bookings WHERE id = ${id} FOR UPDATE
    `;
    if (!existing) throw new BookingError("NOT_FOUND", "Booking not found.");

    if (existing.reservationId) {
      await sql`
        UPDATE bookings SET status = 'cancelled', "updatedAt" = NOW() WHERE id = ${id}
      `;
      return { result: "cancelled" as const };
    }

    await sql`DELETE FROM bookings WHERE id = ${id}`;
    return { result: "deleted" as const };
  });
}

export async function cancelLegacyBooking(id: string): Promise<void> {
  const rows = await getSql()`
    UPDATE studio_booking_items
    SET is_active = FALSE, updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id
  `;
  if (!rows.length) throw new BookingError("NOT_FOUND", "Booking not found.");
}
