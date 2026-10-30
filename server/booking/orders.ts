import {
  minutesToTime,
  priceForMinutes,
  type Audience,
  type OccurrenceProblem,
  type RentalItemInput,
} from "../../shared/booking";
import {
  isStudioXCombination,
  STUDIO_X_NAME,
} from "../../shared/studioCatalog";
import { getSql, inTransaction, type SqlExecutor } from "../db";
import {
  factsForSpace,
  loadActiveStudios,
  loadDayFacts,
  resolveSpace,
  spaceKey,
  type Space,
  type StudioRow,
} from "./facts";
import {
  BookingError,
  evaluateOccurrence,
  expandItems,
  findInternalOverlaps,
  type Occurrence,
} from "./rules";

const HOLD_GRACE_MINUTES = 10;

export type ReservationStatus =
  | "checkout_pending"
  | "paid"
  | "expired"
  | "cancelled";

export type QuotedOccurrence = {
  date: string;
  startTime: string;
  endTime: string;
  amount: number;
  problem: OccurrenceProblem | null;
};

export type QuotedItem = {
  itemIndex: number;
  audience: Audience;
  spaceKey: string;
  spaceName: string;
  studioIds: number[];
  durationMinutes: number;
  hourlyRate: number;
  occurrenceAmount: number;
  occurrences: QuotedOccurrence[];
};

export type OrderQuote = {
  currency: string;
  items: QuotedItem[];
  total: number;
  available: boolean;
};

type PricedOccurrence = Occurrence & {
  space: Space;
  /** Per-studio amounts; Studio X is billed as its two rooms. */
  lines: { studioId: number; amount: number }[];
  amount: number;
  problem: OccurrenceProblem | null;
};

function unavailableSpace(studioIds: number[]): Space {
  return {
    key: spaceKey(studioIds),
    studioIds,
    name: "",
    isCombination: studioIds.length > 1,
    capacity: null,
    size: null,
    hourlyRate: 0,
    groupHourlyRate: 0,
  };
}

function studioRate(studio: StudioRow, audience: Audience): number {
  return audience === "group" ? studio.groupHourlyRate : studio.hourlyRate;
}

/**
 * Validates and prices every occurrence of an order against live data.
 * Read-only: safe outside a transaction for quotes, and reused inside the
 * hold transaction after the advisory locks are taken.
 */
async function priceOrder(
  sql: SqlExecutor,
  items: readonly RentalItemInput[],
  now: Date
): Promise<PricedOccurrence[]> {
  const occurrences = expandItems(items);
  const studios = await loadActiveStudios(sql);
  const studioIds = Array.from(new Set(occurrences.flatMap(o => o.studioIds)));
  const dates = Array.from(new Set(occurrences.map(o => o.date)));
  const facts = await loadDayFacts(sql, studioIds, dates);
  const overlaps = findInternalOverlaps(occurrences);

  return occurrences.map((occurrence, index) => {
    let space: Space;
    try {
      space = resolveSpace(studios, occurrence.studioIds);
    } catch {
      // The studio was deactivated or renamed after it was added to a cart.
      return {
        ...occurrence,
        space: unavailableSpace(occurrence.studioIds),
        lines: [],
        amount: 0,
        problem: "invalid" as const,
      };
    }
    const minutes = occurrence.end - occurrence.start;
    const { audience } = items[occurrence.itemIndex];
    const lines = occurrence.studioIds.map(studioId => {
      const studio = studios.find(row => row.id === studioId) as StudioRow;
      return {
        studioId,
        amount: priceForMinutes(studioRate(studio, audience), minutes),
      };
    });
    const problem = overlaps.has(index)
      ? "overlap"
      : evaluateOccurrence(
          occurrence,
          factsForSpace(facts, occurrence.studioIds, occurrence.date),
          now
        );
    return {
      ...occurrence,
      space,
      lines,
      amount: lines.reduce((total, line) => total + line.amount, 0),
      problem,
    };
  });
}

function toQuote(
  items: readonly RentalItemInput[],
  priced: readonly PricedOccurrence[],
  currency: string
): OrderQuote {
  const quotedItems: QuotedItem[] = items.map(({ audience }, itemIndex) => {
    const occurrences = priced.filter(o => o.itemIndex === itemIndex);
    const first = occurrences[0];
    return {
      itemIndex,
      audience,
      spaceKey: first.space.key,
      spaceName: first.space.name,
      studioIds: first.studioIds,
      durationMinutes: first.end - first.start,
      hourlyRate:
        audience === "group"
          ? first.space.groupHourlyRate
          : first.space.hourlyRate,
      occurrenceAmount: first.amount,
      occurrences: occurrences.map(o => ({
        date: o.date,
        startTime: minutesToTime(o.start),
        endTime: minutesToTime(o.end),
        amount: o.amount,
        problem: o.problem,
      })),
    };
  });

  return {
    currency,
    items: quotedItems,
    total: priced.reduce((total, o) => total + o.amount, 0),
    available: priced.every(o => o.problem === null),
  };
}

export async function quoteOrder(input: {
  items: RentalItemInput[];
  currency: string;
  now?: Date;
}): Promise<OrderQuote> {
  const priced = await priceOrder(
    getSql(),
    input.items,
    input.now ?? new Date()
  );
  return toQuote(input.items, priced, input.currency);
}

/** The rate every item shares, or null when the order mixes both. */
function sharedAudience(items: readonly RentalItemInput[]): Audience | null {
  const audiences = new Set(items.map(item => item.audience));
  return audiences.size === 1 ? items[0].audience : null;
}

export async function expireStaleReservations(sql: SqlExecutor): Promise<void> {
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

/** Serializes writers per studio and date. Keys are sorted to avoid deadlocks. */
export async function lockStudioDates(
  sql: SqlExecutor,
  pairs: readonly { studioId: number; date: string }[]
): Promise<void> {
  const keys = Array.from(
    new Set(pairs.map(pair => `studio-booking:${pair.date}:${pair.studioId}`))
  ).sort();
  for (const key of keys) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

export type CreateHoldInput = {
  id: string;
  items: RentalItemInput[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  currency: string;
  cancelTokenHash: string;
  sessionExpiresAt: Date;
  now?: Date;
};

export type HoldResult =
  | { status: "held"; quote: OrderQuote; holdExpiresAt: Date }
  | { status: "unavailable"; quote: OrderQuote };

/**
 * Re-validates the order under per-studio/date locks and writes a
 * time-limited hold: one reservation plus one booking row per studio and date.
 */
export async function createReservationHold(
  input: CreateHoldInput
): Promise<HoldResult> {
  const occurrences = expandItems(input.items);
  const holdExpiresAt = new Date(
    input.sessionExpiresAt.getTime() + HOLD_GRACE_MINUTES * 60 * 1000
  );

  return inTransaction(async sql => {
    await lockStudioDates(
      sql,
      occurrences.flatMap(o =>
        o.studioIds.map(studioId => ({ studioId, date: o.date }))
      )
    );
    await expireStaleReservations(sql);

    const priced = await priceOrder(sql, input.items, input.now ?? new Date());
    const quote = toQuote(input.items, priced, input.currency);
    if (!quote.available) return { status: "unavailable" as const, quote };
    if (quote.total <= 0) {
      throw new BookingError(
        "PRECONDITION_FAILED",
        "The order total must be greater than zero."
      );
    }

    await sql`
      INSERT INTO reservations (
        id, "userName", "userEmail", "userPhone", audience, "specialRequests",
        "amountTotal", currency, status, "cancelTokenHash", "holdExpiresAt",
        "createdAt", "updatedAt"
      ) VALUES (
        ${input.id}, ${input.customerName}, ${input.customerEmail},
        ${input.customerPhone ?? null}, ${sharedAudience(input.items)}, ${input.notes ?? null},
        ${quote.total}, ${input.currency}, 'checkout_pending', ${input.cancelTokenHash},
        ${holdExpiresAt.toISOString()}::timestamptz, NOW(), NOW()
      )
    `;

    for (const occurrence of priced) {
      for (const line of occurrence.lines) {
        await sql`
          INSERT INTO bookings (
            "reservationId", "studioId", "userName", "userEmail", "userPhone",
            "bookingDate", "startTime", "endTime", duration, "totalPrice", status,
            audience, "specialRequests", "createdAt", "updatedAt"
          ) VALUES (
            ${input.id}, ${line.studioId}, ${input.customerName}, ${input.customerEmail},
            ${input.customerPhone ?? null}, ${occurrence.date}::date + TIME '12:00',
            ${minutesToTime(occurrence.start)}, ${minutesToTime(occurrence.end)},
            ${occurrence.end - occurrence.start}, ${line.amount}, 'pending',
            ${input.items[occurrence.itemIndex].audience}, ${input.notes ?? null},
            NOW(), NOW()
          )
        `;
      }
    }

    return { status: "held" as const, quote, holdExpiresAt };
  });
}

export async function attachCheckoutSession(
  reservationId: string,
  checkoutSessionId: string
): Promise<void> {
  const rows = await getSql()`
    UPDATE reservations
    SET "stripeCheckoutSessionId" = ${checkoutSessionId}, "updatedAt" = NOW()
    WHERE id = ${reservationId}
      AND status = 'checkout_pending'
      AND ("stripeCheckoutSessionId" IS NULL OR "stripeCheckoutSessionId" = ${checkoutSessionId})
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
  await inTransaction(async sql => {
    const released = await sql`
      UPDATE reservations
      SET status = ${finalStatus}, "updatedAt" = NOW()
      WHERE id = ${reservationId} AND status = 'checkout_pending'
      RETURNING id
    `;
    if (!released.length) return;
    await sql`
      UPDATE bookings
      SET status = 'cancelled', "updatedAt" = NOW()
      WHERE "reservationId" = ${reservationId} AND status = 'pending'
    `;
  });
}

export type ReservationRecord = {
  id: string;
  status: ReservationStatus;
  amountTotal: number;
  currency: string;
  stripeCheckoutSessionId: string | null;
  cancelTokenHash: string;
};

export async function getReservationRecord(
  reservationId: string
): Promise<ReservationRecord | undefined> {
  const rows = await getSql()<ReservationRecord[]>`
    SELECT id, status, "amountTotal", currency, "stripeCheckoutSessionId", "cancelTokenHash"
    FROM reservations
    WHERE id = ${reservationId}
    LIMIT 1
  `;
  return rows[0];
}

export type ReservationSummary = {
  reservationId: string;
  status: ReservationStatus;
  amountTotal: number;
  currency: string;
  customerEmail: string;
  items: {
    spaceName: string;
    audience: Audience;
    date: string;
    startTime: string;
    endTime: string;
  }[];
};

export async function getReservationSummary(
  reservationId: string,
  sql: SqlExecutor = getSql()
): Promise<ReservationSummary> {
  const rows = await sql<
    {
      id: string;
      status: ReservationStatus;
      amountTotal: number;
      currency: string;
      audience: Audience;
      userEmail: string;
      date: string;
      startTime: string;
      endTime: string;
      studioName: string;
    }[]
  >`
    SELECT
      r.id, r.status, r."amountTotal", r.currency, r."userEmail",
      COALESCE(b.audience, r.audience, 'private') AS audience,
      to_char(b."bookingDate", 'YYYY-MM-DD') AS date,
      b."startTime", b."endTime", s.name AS "studioName"
    FROM reservations AS r
    JOIN bookings AS b ON b."reservationId" = r.id
    JOIN studios AS s ON s.id = b."studioId"
    WHERE r.id = ${reservationId}
    ORDER BY date, b."startTime", s.id
  `;
  if (!rows.length)
    throw new BookingError("NOT_FOUND", "Reservation not found.");

  const grouped = new Map<
    string,
    {
      date: string;
      startTime: string;
      endTime: string;
      audience: Audience;
      names: string[];
    }
  >();
  for (const row of rows) {
    const key = `${row.date}|${row.startTime}|${row.endTime}|${row.audience}`;
    const entry = grouped.get(key) ?? {
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      audience: row.audience,
      names: [],
    };
    entry.names.push(row.studioName);
    grouped.set(key, entry);
  }

  const first = rows[0];
  return {
    reservationId: first.id,
    status: first.status,
    amountTotal: first.amountTotal,
    currency: first.currency,
    customerEmail: first.userEmail,
    items: Array.from(grouped.values()).map(entry => ({
      spaceName: isStudioXCombination(entry.names)
        ? STUDIO_X_NAME
        : entry.names.join(" + "),
      audience: entry.audience,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
    })),
  };
}

export async function markReservationPaid(input: {
  reservationId: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  amountTotal: number;
  currency: string;
}): Promise<ReservationSummary> {
  return inTransaction(async sql => {
    const rows = await sql<
      {
        status: ReservationStatus;
        amountTotal: number;
        currency: string;
        stripeCheckoutSessionId: string | null;
      }[]
    >`
      SELECT status, "amountTotal", currency, "stripeCheckoutSessionId"
      FROM reservations
      WHERE id = ${input.reservationId}
      FOR UPDATE
    `;
    const reservation = rows[0];
    if (!reservation)
      throw new BookingError("NOT_FOUND", "Reservation not found.");
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
      if (reservation.status !== "checkout_pending") {
        // Stripe never accepts payment after the session expires, and holds
        // outlive sessions by HOLD_GRACE_MINUTES; staff should still review.
        console.warn("Payment confirmed for a released reservation hold", {
          reservationId: input.reservationId,
          previousStatus: reservation.status,
        });
      }
      await sql`
        UPDATE reservations
        SET status = 'paid',
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
          AND status <> 'confirmed'
      `;
    }

    return getReservationSummary(input.reservationId, sql);
  });
}

export async function expireReservationBySession(
  checkoutSessionId: string
): Promise<void> {
  await inTransaction(async sql => {
    const rows = await sql<{ id: string }[]>`
      UPDATE reservations
      SET status = 'expired', "updatedAt" = NOW()
      WHERE "stripeCheckoutSessionId" = ${checkoutSessionId}
        AND status = 'checkout_pending'
      RETURNING id
    `;
    for (const row of rows) {
      await sql`
        UPDATE bookings
        SET status = 'cancelled', "updatedAt" = NOW()
        WHERE "reservationId" = ${row.id} AND status = 'pending'
      `;
    }
  });
}
