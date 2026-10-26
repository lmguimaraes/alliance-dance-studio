import { nanoid } from "nanoid";
import type Stripe from "stripe";
import { studioNow } from "../shared/booking";
import { ENV } from "./_core/env";
import { BookingError } from "./booking/rules";
import { getSql } from "./db";
import {
  checkoutExpiry,
  getPaymentIntentId,
  getStripe,
  stripePaymentUrl,
  type CheckoutLocale,
} from "./stripeClient";

/**
 * Class passes. The customer enters name, email and (for class packages) the
 * class on the website; the site creates a Stripe Checkout page with the email
 * locked and the name and class in the order summary, and records the sale.
 */

export type PassPurchaseStatus =
  | "checkout_pending"
  | "paid"
  | "expired"
  | "cancelled";

export type PassPurchaseSummary = {
  status: PassPurchaseStatus;
  passName: string;
  classLabel: string | null;
  customerEmail: string;
  amountCents: number;
  currency: string;
};

/** A pending purchase older than this has an expired Stripe page. */
const STALE_AFTER_MINUTES = 45;

const summaryText: Record<
  CheckoutLocale,
  { forName: (name: string) => string; classLabel: string }
> = {
  en: { forName: name => `For ${name}.`, classLabel: "Class:" },
  fr: { forName: name => `Pour ${name}.`, classLabel: "Cours :" },
  es: { forName: name => `Para ${name}.`, classLabel: "Clase:" },
};

function localizedName(
  locale: CheckoutLocale,
  names: { en: string; fr: string | null; es: string | null }
): string {
  return (
    (locale === "fr" ? names.fr : locale === "es" ? names.es : null) || names.en
  );
}

/** "Salsa On1 Intermediate (Tuesday, 7:00 p.m.)" in the customer's language. */
export function classLabel(
  klass: { title: string; dayOfWeek: number; startTime: string },
  locale: CheckoutLocale
): string {
  const tag = `${locale}-CA`;
  // 2026-10-18 is a Sunday, so day 0..6 maps onto that week.
  const weekday = new Intl.DateTimeFormat(tag, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 9, 18 + klass.dayOfWeek)));
  const [hours, minutes] = klass.startTime.split(":").map(Number);
  const time = new Intl.DateTimeFormat(tag, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hours, minutes)));
  return `${klass.title} (${weekday}, ${time})`;
}

/** Shown under the pass name on the Stripe page; not editable there. */
function orderDescription(
  locale: CheckoutLocale,
  customerName: string,
  label: string | null
): string {
  const text = summaryText[locale];
  return [text.forName(customerName), label && `${text.classLabel} ${label}`]
    .filter(Boolean)
    .join(" ");
}

export async function createPassCheckout(input: {
  passId: number;
  classId: number | null;
  customerName: string;
  customerEmail: string;
  locale: CheckoutLocale;
}): Promise<{ checkoutUrl: string }> {
  const stripe = getStripe();
  const sql = getSql();

  const [pass] = await sql<
    {
      nameEn: string;
      nameFr: string | null;
      nameEs: string | null;
      priceCents: number;
      currency: string;
      requiresClass: boolean;
    }[]
  >`
    SELECT name_en AS "nameEn", name_fr AS "nameFr", name_es AS "nameEs",
           price_cents AS "priceCents", currency, requires_class AS "requiresClass"
    FROM class_passes
    WHERE id = ${input.passId} AND is_active
  `;
  if (!pass)
    throw new BookingError("NOT_FOUND", "This pass is no longer available.");
  if (pass.priceCents <= 0) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "This pass has no price yet."
    );
  }

  let label: string | null = null;
  let classId: number | null = null;
  if (pass.requiresClass) {
    if (!input.classId)
      throw new BookingError("BAD_REQUEST", "Choose the class for this pass.");
    const today = studioNow().dateKey;
    const [klass] = await sql<
      { id: number; title: string; dayOfWeek: number; startTime: string }[]
    >`
      SELECT id, title, day_of_week AS "dayOfWeek",
             to_char(start_time, 'HH24:MI') AS "startTime"
      FROM classes
      WHERE id = ${input.classId} AND is_active
        AND (ends_on IS NULL OR ends_on >= ${today}::date)
    `;
    if (!klass) {
      throw new BookingError(
        "NOT_FOUND",
        "This class is no longer on the schedule."
      );
    }
    classId = klass.id;
    label = classLabel(klass, input.locale);
  }

  const id = nanoid(24);
  const passName = localizedName(input.locale, {
    en: pass.nameEn,
    fr: pass.nameFr,
    es: pass.nameEs,
  });

  await sql`
    INSERT INTO pass_purchases (
      id, pass_id, pass_name, class_id, class_label, customer_name,
      customer_email, amount_cents, currency, locale
    ) VALUES (
      ${id}, ${input.passId}, ${passName}, ${classId}, ${label},
      ${input.customerName}, ${input.customerEmail}, ${pass.priceCents},
      ${pass.currency}, ${input.locale}
    )
  `;

  const returnUrl = new URL("/classes", ENV.appUrl);
  returnUrl.searchParams.set("pass", "success");
  const successUrl = `${returnUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`;
  returnUrl.searchParams.set("pass", "cancelled");

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        // Prefilled and not editable on the Stripe page.
        customer_email: input.customerEmail,
        metadata: { passPurchaseId: id },
        payment_intent_data: {
          metadata: { passPurchaseId: id },
          description: [passName, input.customerName, label]
            .filter(Boolean)
            .join(" · "),
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: pass.currency,
              unit_amount: pass.priceCents,
              product_data: {
                name: passName,
                description: orderDescription(
                  input.locale,
                  input.customerName,
                  label
                ),
              },
            },
          },
        ],
        success_url: successUrl,
        cancel_url: returnUrl.toString(),
        expires_at: checkoutExpiry(),
        locale: input.locale,
        submit_type: "pay",
      },
      { idempotencyKey: `class-pass:${id}` }
    );
  } catch (error) {
    await setStatus(id, "cancelled");
    console.error("Stripe Checkout session creation failed for a pass", {
      passPurchaseId: id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new BookingError(
      "PRECONDITION_FAILED",
      "Payment could not be started. Please try again."
    );
  }

  if (!session.url) {
    await setStatus(id, "cancelled");
    throw new BookingError(
      "INTERNAL_SERVER_ERROR",
      "Stripe did not return a checkout URL."
    );
  }

  await sql`
    UPDATE pass_purchases
    SET stripe_checkout_session_id = ${session.id}, updated_at = NOW()
    WHERE id = ${id}
  `;
  return { checkoutUrl: session.url };
}

async function setStatus(
  id: string,
  status: "cancelled" | "expired"
): Promise<void> {
  await getSql()`
    UPDATE pass_purchases
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id} AND status = 'checkout_pending'
  `;
}

async function getSummary(id: string): Promise<PassPurchaseSummary> {
  const [row] = await getSql()<PassPurchaseSummary[]>`
    SELECT status, pass_name AS "passName", class_label AS "classLabel",
           customer_email AS "customerEmail", amount_cents AS "amountCents",
           currency
    FROM pass_purchases
    WHERE id = ${id}
  `;
  if (!row) throw new BookingError("NOT_FOUND", "Purchase not found.");
  return row;
}

export function passPurchaseId(
  session: Stripe.Checkout.Session
): string | null {
  return session.metadata?.passPurchaseId || null;
}

/**
 * Records the result of a pass's Stripe session. Called when the customer
 * returns from Stripe and by the webhook; safe to call more than once.
 */
export async function confirmPassCheckout(
  checkoutSessionId: string
): Promise<PassPurchaseSummary> {
  const session =
    await getStripe().checkout.sessions.retrieve(checkoutSessionId);
  const id = passPurchaseId(session);
  if (!id) throw new BookingError("NOT_FOUND", "Purchase not found.");

  if (session.payment_status !== "paid") {
    if (session.status === "expired") await setStatus(id, "expired");
    return getSummary(id);
  }

  const purchase = await getSummary(id);
  if (
    session.amount_total !== purchase.amountCents ||
    session.currency?.toLowerCase() !== purchase.currency.toLowerCase()
  ) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "Stripe payment amount does not match the purchase."
    );
  }

  await getSql()`
    UPDATE pass_purchases
    SET status = 'paid',
        stripe_checkout_session_id = ${session.id},
        stripe_payment_intent_id = ${getPaymentIntentId(session)},
        paid_at = COALESCE(paid_at, NOW()),
        updated_at = NOW()
    WHERE id = ${id} AND status <> 'paid'
  `;
  return getSummary(id);
}

export async function expirePassCheckout(
  session: Stripe.Checkout.Session
): Promise<void> {
  const id = passPurchaseId(session);
  if (id) await setStatus(id, "expired");
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type PassSale = {
  id: string;
  createdAt: string;
  paidAt: string | null;
  status: PassPurchaseStatus;
  customerName: string;
  customerEmail: string;
  passName: string;
  classLabel: string | null;
  amountCents: number;
  currency: string;
  stripeUrl: string | null;
};

const SALES_LIMIT = 500;

export async function listPassSales(input: {
  status: "paid" | "all";
  search?: string;
}): Promise<PassSale[]> {
  const sql = getSql();
  // Stripe pages close after about half an hour; tidy up missed webhooks.
  await sql`
    UPDATE pass_purchases
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'checkout_pending'
      AND created_at < NOW() - make_interval(mins => ${STALE_AFTER_MINUTES})
  `;

  const search = input.search?.trim().toLowerCase() ?? "";
  const pattern = `%${search.replace(/[\\%_]/g, character => `\\${character}`)}%`;
  const rows = await sql<
    (Omit<PassSale, "stripeUrl"> & { paymentIntentId: string | null })[]
  >`
    SELECT
      id,
      to_char(created_at AT TIME ZONE 'America/Toronto', 'YYYY-MM-DD"T"HH24:MI') AS "createdAt",
      to_char(paid_at AT TIME ZONE 'America/Toronto', 'YYYY-MM-DD"T"HH24:MI') AS "paidAt",
      status, customer_name AS "customerName", customer_email AS "customerEmail",
      pass_name AS "passName", class_label AS "classLabel",
      amount_cents AS "amountCents", currency,
      stripe_payment_intent_id AS "paymentIntentId"
    FROM pass_purchases
    WHERE (${input.status}::text = 'all' OR status = 'paid')
      AND (
        ${search} = ''
        OR lower(customer_name) LIKE ${pattern}
        OR lower(customer_email) LIKE ${pattern}
        OR lower(pass_name) LIKE ${pattern}
        OR lower(COALESCE(class_label, '')) LIKE ${pattern}
      )
    ORDER BY created_at DESC
    LIMIT ${SALES_LIMIT}
  `;
  return rows.map(({ paymentIntentId, ...row }) => ({
    ...row,
    stripeUrl: paymentIntentId ? stripePaymentUrl(paymentIntentId) : null,
  }));
}
