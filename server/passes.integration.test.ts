/**
 * Class-pass checkout against a real PostgreSQL database with the Stripe SDK
 * replaced by an in-memory fake. The database part runs only when
 * TEST_DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
          const id = `cs_test_pass${fake.counter}`;
          const session: FakeSession = {
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            metadata: params.metadata,
            client_reference_id: params.client_reference_id ?? null,
            payment_status: "unpaid",
            status: "open",
            amount_total: params.line_items[0].price_data.unit_amount,
            currency: params.line_items[0].price_data.currency,
            payment_intent: null,
          };
          fake.sessions.set(id, session);
          fake.createCalls.push({ params, options });
          return session;
        },
        retrieve: async (id: string) => fake.sessions.get(id),
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

// Server modules read their settings when first imported.
beforeAll(() => {
  if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DATABASE_SSL = process.env.TEST_DATABASE_SSL ?? "false";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
  process.env.APP_URL = "https://alliance.example";
});

describe("class labels on the Stripe page", () => {
  it("names the class, weekday and time in the customer's language", async () => {
    const { classLabel } = await import("./passes");
    const klass = { title: "Salsa On1", dayOfWeek: 2, startTime: "19:00" };
    expect(classLabel(klass, "en")).toBe("Salsa On1 (Tuesday, 7:00 p.m.)");
    expect(classLabel(klass, "fr")).toBe("Salsa On1 (mardi, 19 h 00)");
    expect(classLabel({ ...klass, dayOfWeek: 0 }, "es")).toMatch(
      /^Salsa On1 \(domingo, /
    );
  });

  it("adds the full date for a drop-in", async () => {
    const { classLabel } = await import("./passes");
    const klass = { title: "Salsa On1", dayOfWeek: 2, startTime: "19:00" };
    expect(classLabel(klass, "en", "2026-10-27")).toBe(
      "Salsa On1 (Tuesday, October 27, 7:00 p.m.)"
    );
    expect(classLabel(klass, "fr", "2026-10-27")).toBe(
      "Salsa On1 (mardi 27 octobre, 19 h 00)"
    );
    expect(classLabel(klass, "es", "2026-10-27")).toMatch(
      /^Salsa On1 \(martes, 27 de octubre, /
    );
  });
});

describe.skipIf(!TEST_DATABASE_URL)("class-pass checkout (PostgreSQL)", () => {
  let passes: typeof import("./passes");
  let stripe: typeof import("./stripe");
  let db: typeof import("./db");
  let packageId = 0;
  let unlimitedId = 0;
  let inactiveId = 0;
  let dropInId = 0;
  let classId = 0;

  const customer = {
    customerName: "Maria Lopez",
    customerEmail: "maria.passes@example.com",
    classDate: null,
  };
  const purchaseIds = () =>
    Array.from(fake.sessions.values()).map(
      session => session.metadata.passPurchaseId
    );

  beforeAll(async () => {
    passes = await import("./passes");
    stripe = await import("./stripe");
    db = await import("./db");
    const sql = db.getSql();
    const insertPass = async (
      name: string,
      requiresClass: boolean,
      isActive = true,
      requiresDate = false
    ) =>
      (
        await sql<{ id: number }[]>`
          INSERT INTO class_passes (category, name_en, name_fr, price_cents, requires_class, requires_date, is_active)
          VALUES ('classes', ${name}, ${`${name} (fr)`}, 16000, ${requiresClass}, ${requiresDate}, ${isActive})
          RETURNING id
        `
      )[0].id;
    packageId = await insertPass("Test 8-class pass", true);
    unlimitedId = await insertPass("Test unlimited", false);
    inactiveId = await insertPass("Test retired pass", false, false);
    dropInId = await insertPass("Test drop-in", true, true, true);
    [{ id: classId }] = await sql<{ id: number }[]>`
      INSERT INTO classes (title, style, level, day_of_week, start_time, duration_minutes)
      VALUES ('Test Salsa', 'Salsa', 'beginner', 2, '19:00', 60)
      RETURNING id
    `;
  });

  afterAll(async () => {
    if (!db) return;
    const sql = db.getSql();
    const ids = purchaseIds().filter(Boolean);
    if (ids.length)
      await sql`DELETE FROM pass_purchases WHERE id IN ${sql(ids)}`;
    await sql`DELETE FROM pass_purchases WHERE customer_email = ${customer.customerEmail}`;
    await sql`DELETE FROM class_passes WHERE id IN ${sql([packageId, unlimitedId, inactiveId, dropInId])}`;
    await sql`DELETE FROM classes WHERE id = ${classId}`;
    await db.closeDatabase();
  });

  it("requires a class for class packages and refuses retired passes", async () => {
    await expect(
      passes.createPassCheckout({
        ...customer,
        passId: packageId,
        classId: null,
        locale: "en",
      })
    ).rejects.toThrow(/Choose the class/);
    await expect(
      passes.createPassCheckout({
        ...customer,
        passId: inactiveId,
        classId: null,
        locale: "en",
      })
    ).rejects.toThrow(/no longer available/);
  });

  it("opens Stripe with the email locked and name and class in the order", async () => {
    const result = await passes.createPassCheckout({
      ...customer,
      passId: packageId,
      classId,
      locale: "fr",
    });
    expect(result.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const { params, options } = fake.createCalls.at(-1)!;
    expect(params.customer_email).toBe(customer.customerEmail);
    expect(params.locale).toBe("fr");
    expect(params.line_items[0].price_data).toMatchObject({
      unit_amount: 16000,
      product_data: {
        name: "Test 8-class pass (fr)",
        description: "Pour Maria Lopez. Cours : Test Salsa (mardi, 19 h 00)",
      },
    });
    expect(params.success_url).toBe(
      "https://alliance.example/classes?pass=success&session_id={CHECKOUT_SESSION_ID}"
    );
    expect(options.idempotencyKey).toMatch(/^class-pass:/);

    const sql = db.getSql();
    const [row] = await sql<{ status: string; classLabel: string }[]>`
      SELECT status, class_label AS "classLabel" FROM pass_purchases
      WHERE id = ${params.metadata.passPurchaseId}
    `;
    expect(row).toEqual({
      status: "checkout_pending",
      classLabel: "Test Salsa (mardi, 19 h 00)",
    });
  });

  it("needs a date the class takes place for a drop-in", async () => {
    const { addDays, dayOfWeek, studioNow } = await import("../shared/booking");
    const today = studioNow().dateKey;
    // The test class is on Tuesdays; pick one from tomorrow on.
    let tuesday = addDays(today, 1);
    while (dayOfWeek(tuesday) !== 2) tuesday = addDays(tuesday, 1);
    const dropIn = (classDate: string | null) =>
      passes.createPassCheckout({
        ...customer,
        passId: dropInId,
        classId,
        classDate,
        locale: "en",
      });

    await expect(dropIn(null)).rejects.toThrow(/Choose the date/);
    for (const wrong of [
      addDays(tuesday, 1), // a Wednesday
      addDays(tuesday, -7), // in the past
      addDays(tuesday, 7 * 9), // past the schedule
    ]) {
      await expect(dropIn(wrong)).rejects.toThrow(/doesn't take place/);
    }

    await dropIn(tuesday);
    const { params } = fake.createCalls.at(-1)!;
    const label = passes.classLabel(
      { title: "Test Salsa", dayOfWeek: 2, startTime: "19:00" },
      "en",
      tuesday
    );
    expect(params.line_items[0].price_data.product_data.description).toBe(
      `For Maria Lopez. Class: ${label}`
    );
    const sql = db.getSql();
    const [row] = await sql<{ classDate: string; classLabel: string }[]>`
      SELECT to_char(class_date, 'YYYY-MM-DD') AS "classDate",
             class_label AS "classLabel"
      FROM pass_purchases
      WHERE id = ${params.metadata.passPurchaseId}
    `;
    expect(row).toEqual({ classDate: tuesday, classLabel: label });
  });

  it("ignores a class for passes that don't need one", async () => {
    await passes.createPassCheckout({
      ...customer,
      passId: unlimitedId,
      classId,
      locale: "en",
    });
    const { params } = fake.createCalls.at(-1)!;
    expect(params.line_items[0].price_data.product_data.description).toBe(
      "For Maria Lopez."
    );
  });

  it("records payment once, on return or by webhook", async () => {
    const session = Array.from(fake.sessions.values()).at(-1)!;
    expect((await passes.confirmPassCheckout(session.id)).status).toBe(
      "checkout_pending"
    );

    session.payment_status = "paid";
    session.status = "complete";
    session.payment_intent = "pi_test_pass";
    const paid = await passes.confirmPassCheckout(session.id);
    expect(paid).toMatchObject({
      status: "paid",
      passName: "Test unlimited",
      classLabel: null,
      amountCents: 16000,
    });
    expect((await passes.confirmPassCheckout(session.id)).status).toBe("paid");

    session.amount_total = 1;
    await expect(passes.confirmPassCheckout(session.id)).rejects.toThrow(
      /does not match/
    );
    session.amount_total = 16000;
  });

  it("handles pass sessions in the Stripe webhook", async () => {
    const send = async (event: unknown) => {
      const response = { statusCode: 200 };
      const res = {
        status(code: number) {
          response.statusCode = code;
          return res;
        },
        send: () => res,
        json: () => res,
      };
      await stripe.stripeWebhookHandler(
        {
          headers: { "stripe-signature": "valid" },
          body: Buffer.from(JSON.stringify(event)),
        } as any,
        res as any,
        () => undefined
      );
      return response.statusCode;
    };

    await passes.createPassCheckout({
      ...customer,
      passId: packageId,
      classId,
      locale: "en",
    });
    const toPay = Array.from(fake.sessions.values()).at(-1)!;
    toPay.payment_status = "paid";
    toPay.payment_intent = "pi_test_webhook";
    expect(
      await send({
        id: "evt_pass_1",
        type: "checkout.session.completed",
        data: { object: toPay },
      })
    ).toBe(200);

    await passes.createPassCheckout({
      ...customer,
      passId: packageId,
      classId,
      locale: "en",
    });
    const toExpire = Array.from(fake.sessions.values()).at(-1)!;
    toExpire.status = "expired";
    expect(
      await send({
        id: "evt_pass_2",
        type: "checkout.session.expired",
        data: { object: toExpire },
      })
    ).toBe(200);

    const sql = db.getSql();
    const statuses = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM pass_purchases
      WHERE id IN ${sql([toPay.metadata.passPurchaseId, toExpire.metadata.passPurchaseId])}
    `;
    expect(
      Object.fromEntries(statuses.map(row => [row.id, row.status]))
    ).toEqual({
      [toPay.metadata.passPurchaseId]: "paid",
      [toExpire.metadata.passPurchaseId]: "expired",
    });
  });

  it("lists sales for the admin and expires abandoned checkouts", async () => {
    const sql = db.getSql();
    await passes.createPassCheckout({
      ...customer,
      passId: unlimitedId,
      classId: null,
      locale: "en",
    });
    const abandoned = Array.from(fake.sessions.values()).at(-1)!.metadata
      .passPurchaseId;
    await sql`
      UPDATE pass_purchases SET created_at = NOW() - INTERVAL '2 hours'
      WHERE id = ${abandoned}
    `;

    const paid = await passes.listPassSales({
      status: "paid",
      search: "MARIA.PASSES",
    });
    expect(paid.length).toBe(2);
    expect(paid.every(sale => sale.status === "paid")).toBe(true);
    expect(paid.map(sale => sale.stripeUrl).sort()).toEqual([
      "https://dashboard.stripe.com/test/payments/pi_test_pass",
      "https://dashboard.stripe.com/test/payments/pi_test_webhook",
    ]);

    const all = await passes.listPassSales({
      status: "all",
      search: "maria.passes",
    });
    expect(all.find(sale => sale.id === abandoned)?.status).toBe("expired");
  });
});
