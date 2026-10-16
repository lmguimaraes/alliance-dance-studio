/**
 * Stripe checkout flow against a real PostgreSQL database with the Stripe SDK
 * replaced by an in-memory fake. Runs only when TEST_DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, studioNow } from "../shared/booking";

type FakeSession = {
  id: string;
  url: string;
  metadata: Record<string, string>;
  client_reference_id: string | null;
  payment_status: "paid" | "unpaid";
  status: "open" | "complete" | "expired";
  amount_total: number;
  currency: string;
  payment_intent: string | null;
};

const fake = vi.hoisted(() => ({
  sessions: new Map<string, FakeSession>(),
  createCalls: [] as Array<{ params: any; options: any }>,
  counter: 0,
}));

vi.mock("stripe", () => ({
  default: class FakeStripe {
    checkout = {
      sessions: {
        create: async (params: any, options: any) => {
          fake.counter += 1;
          const id = `cs_test_fake${fake.counter}`;
          const session: FakeSession = {
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            metadata: params.metadata,
            client_reference_id: params.client_reference_id,
            payment_status: "unpaid",
            status: "open",
            amount_total: params.line_items.reduce(
              (total: number, line: any) =>
                total + line.price_data.unit_amount * line.quantity,
              0
            ),
            currency: params.line_items[0].price_data.currency,
            payment_intent: null,
          };
          fake.sessions.set(id, session);
          fake.createCalls.push({ params, options });
          return session;
        },
        retrieve: async (id: string) => fake.sessions.get(id),
        expire: async (id: string) => {
          const session = fake.sessions.get(id)!;
          session.status = "expired";
          return session;
        },
      },
    };
    webhooks = {
      constructEvent: (body: Buffer, signature: string) => {
        if (signature !== "valid") throw new Error("Invalid signature");
        return JSON.parse(body.toString("utf8"));
      },
    };
  },
}));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "Stripe checkout (PostgreSQL, fake Stripe)",
  () => {
    let stripe: typeof import("./stripe");
    let db: typeof import("./db");
    let orders: typeof import("./booking/orders");
    let studio5 = 0;
    let studio6 = 0;
    const date = addDays(studioNow().dateKey, 12);
    const reservationIds = () =>
      Array.from(fake.sessions.values()).map(
        session => session.metadata.reservationId
      );

    const customer = {
      customerName: "Stripe Test",
      customerEmail: "stripe@example.com",
      locale: "fr" as const,
    };

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      process.env.DATABASE_SSL = process.env.TEST_DATABASE_SSL ?? "false";
      process.env.STRIPE_SECRET_KEY = "sk_test_fake";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
      process.env.APP_URL = "https://alliance.example";
      stripe = await import("./stripe");
      db = await import("./db");
      orders = await import("./booking/orders");
      const rows = await db.getSql()<{ id: number; name: string }[]>`
        SELECT DISTINCT ON (name) id, name FROM studios
        WHERE name IN ('Studio 5', 'Studio 6') AND "isActive"
        ORDER BY name, id
      `;
      studio5 = rows.find(row => row.name === "Studio 5")!.id;
      studio6 = rows.find(row => row.name === "Studio 6")!.id;
    });

    afterAll(async () => {
      if (!db) return;
      const sql = db.getSql();
      const ids = reservationIds();
      if (ids.length) {
        await sql`DELETE FROM bookings WHERE "reservationId" IN ${sql(ids)}`;
        await sql`DELETE FROM reservations WHERE id IN ${sql(ids)}`;
      }
      await db.closeDatabase();
    });

    it("holds the time and opens Stripe Checkout with one line per weekly series", async () => {
      const result = await stripe.createStripeCheckout({
        ...customer,
        items: [
          {
            studioIds: [studio5],
            audience: "private",
            date,
            startTime: "10:00",
            endTime: "12:00",
            weeks: 3,
          },
          {
            studioIds: [studio6],
            audience: "group",
            date,
            startTime: "10:00",
            endTime: "11:00",
            weeks: 1,
          },
        ],
      });
      expect(result.status).toBe("redirect");

      const { params, options } = fake.createCalls.at(-1)!;
      expect(params.locale).toBe("fr");
      expect(params.line_items).toHaveLength(2);
      expect(params.line_items[0]).toMatchObject({
        quantity: 3,
        price_data: { unit_amount: 3000 },
      });
      expect(params.line_items[0].price_data.product_data.description).toMatch(
        /Tarif privé\.$/
      );
      expect(params.line_items[1]).toMatchObject({
        quantity: 1,
        price_data: { unit_amount: 2200 },
      });
      expect(params.line_items[1].price_data.product_data.description).toMatch(
        /Tarif de groupe\.$/
      );
      expect(params.success_url).toBe(
        "https://alliance.example/studio-rental/checkout?checkout=success&session_id={CHECKOUT_SESSION_ID}"
      );
      expect(params.cancel_url).toMatch(
        /\/studio-rental\/checkout\?checkout=cancelled#reservation_id=/
      );
      expect(options.idempotencyKey).toMatch(/^studio-reservation:/);

      const quote = await orders.quoteOrder({
        items: [
          {
            studioIds: [studio5],
            audience: "private",
            date: addDays(date, 7),
            startTime: "11:00",
            endTime: "13:00",
            weeks: 1,
          },
        ],
        currency: "cad",
      });
      expect(quote.items[0].occurrences[0].problem).toBe("booked");
    });

    it("refuses unavailable orders before contacting Stripe", async () => {
      const calls = fake.createCalls.length;
      const result = await stripe.createStripeCheckout({
        ...customer,
        items: [
          {
            studioIds: [studio5],
            audience: "private",
            date,
            startTime: "11:00",
            endTime: "12:00",
            weeks: 1,
          },
        ],
      });
      expect(result.status).toBe("unavailable");
      expect(fake.createCalls.length).toBe(calls);
    });

    it("confirms a paid session", async () => {
      const session = Array.from(fake.sessions.values()).at(0)!;
      session.payment_status = "paid";
      session.status = "complete";
      session.payment_intent = "pi_fake";

      const summary = await stripe.fulfillCheckoutSession(session.id);
      expect(summary.status).toBe("paid");
      expect(summary.items.map(item => item.audience)).toEqual([
        "private",
        "group",
        "private",
        "private",
      ]);
      expect(summary.amountTotal).toBe(9000 + 2200);
    });

    it("cancels an open session and releases the hold", async () => {
      const result = await stripe.createStripeCheckout({
        ...customer,
        items: [
          {
            studioIds: [studio5],
            audience: "private",
            date,
            startTime: "15:00",
            endTime: "16:00",
            weeks: 1,
          },
        ],
      });
      expect(result.status).toBe("redirect");
      const cancelUrl = new URL(fake.createCalls.at(-1)!.params.cancel_url);
      const hash = new URLSearchParams(cancelUrl.hash.slice(1));

      const summary = await stripe.cancelStripeCheckout({
        reservationId: hash.get("reservation_id")!,
        cancelToken: hash.get("cancel_token")!,
      });
      expect(summary.status).toBe("cancelled");

      await expect(
        stripe.cancelStripeCheckout({
          reservationId: hash.get("reservation_id")!,
          cancelToken: "wrong-token-wrong-token-wrong",
        })
      ).rejects.toThrow(/invalid/);

      const quote = await orders.quoteOrder({
        items: [
          {
            studioIds: [studio5],
            audience: "private",
            date,
            startTime: "15:00",
            endTime: "16:00",
            weeks: 1,
          },
        ],
        currency: "cad",
      });
      expect(quote.available).toBe(true);
    });

    it("verifies webhooks and ignores sessions from Payment Links", async () => {
      const send = async (event: unknown, signature = "valid") => {
        const response = { statusCode: 200, body: undefined as unknown };
        const res = {
          status(code: number) {
            response.statusCode = code;
            return res;
          },
          send(body: unknown) {
            response.body = body;
            return res;
          },
          json(body: unknown) {
            response.body = body;
            return res;
          },
        };
        const req = {
          headers: { "stripe-signature": signature },
          body: Buffer.from(JSON.stringify(event)),
        };
        await stripe.stripeWebhookHandler(
          req as any,
          res as any,
          () => undefined
        );
        return response;
      };

      expect(
        (
          await send(
            {
              id: "evt_1",
              type: "checkout.session.completed",
              data: { object: {} },
            },
            "bad"
          )
        ).statusCode
      ).toBe(400);

      const paymentLink = await send({
        id: "evt_2",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_paymentlink",
            metadata: {},
            client_reference_id: null,
          },
        },
      });
      expect(paymentLink.statusCode).toBe(200);

      const result = await stripe.createStripeCheckout({
        ...customer,
        items: [
          {
            studioIds: [studio5],
            audience: "private",
            date,
            startTime: "18:00",
            endTime: "19:00",
            weeks: 1,
          },
        ],
      });
      expect(result.status).toBe("redirect");
      const session = Array.from(fake.sessions.values()).at(-1)!;
      session.status = "expired";
      const expired = await send({
        id: "evt_3",
        type: "checkout.session.expired",
        data: { object: session },
      });
      expect(expired.statusCode).toBe(200);
      const record = await orders.getReservationRecord(
        session.metadata.reservationId
      );
      expect(record?.status).toBe("expired");
    });
  }
);
