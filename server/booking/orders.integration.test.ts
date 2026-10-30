/**
 * End-to-end checks of availability, holds and staff bookings against a real
 * PostgreSQL database. Runs only when TEST_DATABASE_URL points at a disposable
 * database that has the migrations applied (`DATABASE_URL=… pnpm db:migrate`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, studioNow } from "../../shared/booking";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("booking flow (PostgreSQL)", () => {
  type Modules = {
    db: typeof import("../db");
    orders: typeof import("./orders");
    day: typeof import("./day");
    admin: typeof import("../admin/bookings");
  };
  let m: Modules;
  const reservationIds: string[] = [];
  const bookingIds: number[] = [];
  const classIds: number[] = [];
  const legacyGroupIds: string[] = [];
  let studio5 = 0;
  let studio6 = 0;
  let studio7 = 0;
  const date = addDays(studioNow().dateKey, 10);
  let holdCounter = 0;

  function holdInput(items: import("../../shared/booking").RentalItemInput[]) {
    holdCounter += 1;
    const id = `itest${Date.now()}${holdCounter}`.padEnd(24, "x").slice(0, 24);
    reservationIds.push(id);
    return {
      id,
      items,
      customerName: "Integration Test",
      customerEmail: "integration@example.com",
      currency: "cad",
      cancelTokenHash: "0".repeat(64),
      sessionExpiresAt: new Date(Date.now() + 31 * 60 * 1000),
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.DATABASE_SSL = process.env.TEST_DATABASE_SSL ?? "false";
    m = {
      db: await import("../db"),
      orders: await import("./orders"),
      day: await import("./day"),
      admin: await import("../admin/bookings"),
    };
    const sql = m.db.getSql();
    const rows = await sql<{ id: number; name: string }[]>`
      SELECT DISTINCT ON (name) id, name
      FROM studios
      WHERE name IN ('Studio 5', 'Studio 6', 'Studio 7') AND "isActive"
      ORDER BY name, id
    `;
    const idOf = (name: string) => rows.find(row => row.name === name)!.id;
    studio5 = idOf("Studio 5");
    studio6 = idOf("Studio 6");
    studio7 = idOf("Studio 7");
  });

  afterAll(async () => {
    if (!m) return;
    const sql = m.db.getSql();
    if (reservationIds.length) {
      await sql`DELETE FROM bookings WHERE "reservationId" IN ${sql(reservationIds)}`;
      await sql`DELETE FROM reservations WHERE id IN ${sql(reservationIds)}`;
    }
    if (bookingIds.length)
      await sql`DELETE FROM bookings WHERE id IN ${sql(bookingIds)}`;
    if (classIds.length)
      await sql`DELETE FROM classes WHERE id IN ${sql(classIds)}`;
    if (legacyGroupIds.length) {
      await sql`DELETE FROM studio_booking_items WHERE booking_group_id::text IN ${sql(legacyGroupIds)}`;
      await sql`DELETE FROM studio_booking_groups WHERE id::text IN ${sql(legacyGroupIds)}`;
    }
    await m.db.closeDatabase();
  });

  it("quotes a weekly series", async () => {
    const quote = await m.orders.quoteOrder({
      items: [
        {
          studioIds: [studio6],
          audience: "private",
          date,
          startTime: "10:00",
          endTime: "12:00",
          weeks: 3,
        },
      ],
      currency: "cad",
    });
    expect(quote.available).toBe(true);
    expect(quote.items[0].occurrences).toHaveLength(3);
    expect(quote.total).toBe(3 * 3000);
  });

  it("shows availability past 30 days but won't book it", async () => {
    const today = studioNow().dateKey;
    const later = await m.day.getRentalDay(addDays(today, 45), "cad");
    expect(later.bookable).toBe(false);
    expect(later.bookingOpensOn).toBe(addDays(today, 15));
    expect(later.spaces.length).toBeGreaterThan(0);
    expect((await m.day.getRentalDay(addDays(today, 30), "cad")).bookable).toBe(
      true
    );
    await expect(
      m.day.getRentalDay(addDays(today, 91), "cad")
    ).rejects.toThrow();

    // The fourth week of a series starting on day 20 is day 41.
    const quote = await m.orders.quoteOrder({
      items: [
        {
          studioIds: [studio5],
          audience: "private",
          date: addDays(today, 20),
          startTime: "10:00",
          endTime: "11:00",
          weeks: 4,
        },
      ],
      currency: "cad",
    });
    expect(quote.available).toBe(false);
    expect(quote.items[0].occurrences.map(o => o.problem)).toEqual([
      null,
      null,
      "too_far",
      "too_far",
    ]);
  });

  it("holds time and blocks overlapping requests, including Studio X", async () => {
    const held = await m.orders.createReservationHold(
      holdInput([
        {
          studioIds: [studio6],
          audience: "private",
          date,
          startTime: "10:00",
          endTime: "12:00",
          weeks: 1,
        },
      ])
    );
    expect(held.status).toBe("held");

    const combined = await m.orders.createReservationHold(
      holdInput([
        {
          studioIds: [studio6, studio7],
          audience: "private",
          date: addDays(date, -7),
          startTime: "11:00",
          endTime: "13:00",
          weeks: 2,
        },
      ])
    );
    expect(combined.status).toBe("unavailable");
    expect(combined.quote.items[0].occurrences.map(o => o.problem)).toEqual([
      null,
      "booked",
    ]);

    const view = await m.day.getRentalDay(date, "cad");
    const studio6Slots = view.spaces.find(
      space => space.key === `studio-${studio6}`
    )!.slots;
    const comboSlots = view.spaces.find(space => space.isCombination)!.slots;
    const tenOClock = (600 - view.range.start) / 30;
    expect(studio6Slots.slice(tenOClock, tenOClock + 5)).toEqual([
      "booked",
      "booked",
      "booked",
      "booked",
      "available",
    ]);
    expect(comboSlots[tenOClock]).toBe("booked");
  });

  it("lets only one of two simultaneous holds win", async () => {
    const item = {
      studioIds: [studio5],
      audience: "private" as const,
      date,
      startTime: "15:00",
      endTime: "16:00",
      weeks: 1,
    };
    const results = await Promise.all([
      m.orders.createReservationHold(holdInput([item])),
      m.orders.createReservationHold(holdInput([item])),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([
      "held",
      "unavailable",
    ]);
  });

  it("releases a hold and confirms payment", async () => {
    const input = holdInput([
      {
        studioIds: [studio6, studio7],
        audience: "private",
        date,
        startTime: "18:00",
        endTime: "19:00",
        weeks: 1,
      },
    ]);
    const held = await m.orders.createReservationHold(input);
    expect(held.status).toBe("held");

    await m.orders.releaseReservationHold(input.id);
    const again = await m.orders.quoteOrder({
      items: input.items,
      currency: "cad",
    });
    expect(again.available).toBe(true);

    const second = holdInput(input.items);
    await m.orders.createReservationHold(second);
    const summary = await m.orders.markReservationPaid({
      reservationId: second.id,
      checkoutSessionId: "cs_test_integration",
      paymentIntentId: null,
      amountTotal: 3000,
      currency: "cad",
    });
    expect(summary.status).toBe("paid");
    expect(summary.items).toEqual([
      {
        spaceName: "Studio X",
        audience: "private",
        date,
        startTime: "18:00",
        endTime: "19:00",
      },
    ]);
  });

  it("prices and records private and group bookings in one order", async () => {
    const input = holdInput([
      {
        studioIds: [studio5],
        audience: "private",
        date,
        startTime: "19:00",
        endTime: "20:00",
        weeks: 1,
      },
      {
        studioIds: [studio6],
        audience: "group",
        date,
        startTime: "19:00",
        endTime: "21:00",
        weeks: 2,
      },
    ]);
    const held = await m.orders.createReservationHold(input);
    expect(held.status).toBe("held");
    expect(held.quote.items.map(item => item.audience)).toEqual([
      "private",
      "group",
    ]);
    expect(held.quote.total).toBe(1500 + 2 * 4400);

    const sql = m.db.getSql();
    const [reservation] = await sql<{ audience: string | null }[]>`
      SELECT audience FROM reservations WHERE id = ${input.id}
    `;
    expect(reservation.audience).toBeNull();
    const bookings = await sql<{ studioId: number; audience: string }[]>`
      SELECT "studioId", audience FROM bookings
      WHERE "reservationId" = ${input.id}
      ORDER BY "bookingDate", "studioId"
    `;
    expect(bookings).toEqual([
      { studioId: studio5, audience: "private" },
      { studioId: studio6, audience: "group" },
      { studioId: studio6, audience: "group" },
    ]);

    const summary = await m.orders.getReservationSummary(input.id);
    expect(summary.items.map(item => item.audience)).toEqual([
      "private",
      "group",
      "group",
    ]);
    await m.orders.releaseReservationHold(input.id);
  });

  it("treats classes and legacy bookings as busy", async () => {
    const sql = m.db.getSql();
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const [klass] = await sql<{ id: number }[]>`
      INSERT INTO classes (title, style, level, studio_id, day_of_week, start_time, duration_minutes)
      VALUES ('Integration class', 'Salsa', 'open', ${studio7}, ${weekday}, '20:00', 60)
      RETURNING id
    `;
    classIds.push(klass.id);

    const [group] = await sql<{ id: string }[]>`
      INSERT INTO studio_booking_groups (status, total_amount_cents, start_at, end_at, charge_at, customer_name, customer_email)
      VALUES ('paid', 1000, NOW(), NOW(), NOW(), 'Legacy', 'legacy@example.com')
      RETURNING id::text
    `;
    legacyGroupIds.push(group.id);
    await sql`
      INSERT INTO studio_booking_items (booking_group_id, studio_id, start_at, end_at)
      VALUES (${group.id}::uuid, ${studio5},
        (${date}::date + TIME '09:00') AT TIME ZONE 'America/Toronto',
        (${date}::date + TIME '10:00') AT TIME ZONE 'America/Toronto')
    `;

    const quote = await m.orders.quoteOrder({
      items: [
        {
          studioIds: [studio7],
          audience: "private",
          date,
          startTime: "20:00",
          endTime: "21:00",
          weeks: 1,
        },
        {
          studioIds: [studio5],
          audience: "private",
          date,
          startTime: "09:00",
          endTime: "10:00",
          weeks: 1,
        },
      ],
      currency: "cad",
    });
    expect(quote.items.map(item => item.occurrences[0].problem)).toEqual([
      "booked",
      "booked",
    ]);
  });

  it("lets staff add, edit and remove bookings without double-booking", async () => {
    await expect(
      m.admin.createAdminBooking({
        studioIds: [studio6],
        date,
        startTime: "11:00",
        endTime: "12:30",
        status: "confirmed",
        customerName: "Walk-in",
      })
    ).rejects.toThrow(/overlaps/);

    const created = await m.admin.createAdminBooking({
      studioIds: [studio6, studio7],
      date,
      startTime: "13:00",
      endTime: "14:00",
      status: "confirmed",
      customerName: "Walk-in",
      totalCents: 5001,
    });
    bookingIds.push(...created.ids);
    expect(created.ids).toHaveLength(2);

    const [first] = created.ids;
    await m.admin.updateAdminBooking({
      id: first,
      studioId: studio6,
      date,
      startTime: "13:00",
      endTime: "14:30",
      status: "confirmed",
      customerName: "Walk-in (edited)",
    });

    const list = await m.admin.listAdminBookings({
      range: "upcoming",
      search: "walk-in",
    });
    const edited = list.find(row => row.id === String(first));
    expect(edited).toMatchObject({
      endTime: "14:30",
      customerName: "Walk-in (edited)",
      totalCents: 2501,
    });

    expect(await m.admin.removeAdminBooking(first)).toEqual({
      result: "deleted",
    });
  });
});
