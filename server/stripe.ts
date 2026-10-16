import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { nanoid } from "nanoid";
import Stripe from "stripe";
import { dateKeyToDate, type RentalItemInput } from "../shared/booking";
import { ENV } from "./_core/env";
import {
  attachCheckoutSession,
  createReservationHold,
  expireReservationBySession,
  getReservationRecord,
  getReservationSummary,
  markReservationPaid,
  releaseReservationHold,
  type OrderQuote,
  type ReservationSummary,
} from "./booking/orders";
import { BookingError } from "./booking/rules";

/** Stripe requires Checkout sessions to stay open for at least 30 minutes. */
const CHECKOUT_SESSION_MINUTES = 31;

export type CheckoutLocale = "en" | "fr" | "es";

const lineItemText: Record<
  CheckoutLocale,
  { rental: string; private: string; group: string }
> = {
  en: { rental: "studio rental", private: "Private rate", group: "Group rate" },
  fr: {
    rental: "location de studio",
    private: "Tarif privé",
    group: "Tarif de groupe",
  },
  es: {
    rental: "alquiler de estudio",
    private: "Tarifa privada",
    group: "Tarifa de grupo",
  },
};

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!ENV.stripeSecretKey) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "Stripe is not configured on the server."
    );
  }
  if (ENV.stripeTestModeOnly && !ENV.stripeSecretKey.startsWith("sk_test_")) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "This deployment only accepts a Stripe test-mode secret key."
    );
  }
  stripeClient ??= new Stripe(ENV.stripeSecretKey);
  return stripeClient;
}

function hashCancellationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashCancellationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (!session.payment_intent) return null;
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent.id;
}

function getReservationId(session: Stripe.Checkout.Session): string {
  const reservationId =
    session.metadata?.reservationId || session.client_reference_id;
  if (!reservationId) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "Stripe session is missing its reservation reference."
    );
  }
  return reservationId;
}

function checkoutPageUrl(): URL {
  return new URL("/studio-rental/checkout", ENV.appUrl);
}

function formatDate(dateKey: string, locale: CheckoutLocale): string {
  return new Intl.DateTimeFormat(`${locale}-CA`, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateKeyToDate(dateKey));
}

function lineItems(
  quote: OrderQuote,
  locale: CheckoutLocale
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const text = lineItemText[locale];
  return quote.items.map(item => {
    const first = item.occurrences[0];
    const dates = item.occurrences
      .map(o => formatDate(o.date, locale))
      .join(", ");
    const rate = item.audience === "group" ? text.group : text.private;
    return {
      quantity: item.occurrences.length,
      price_data: {
        currency: quote.currency,
        unit_amount: item.occurrenceAmount,
        product_data: {
          name: `${item.spaceName}, ${text.rental}`,
          description: `${dates}. ${first.startTime}–${first.endTime}. ${rate}.`,
        },
      },
    };
  });
}

export type CheckoutResult =
  | { status: "redirect"; checkoutUrl: string }
  | { status: "unavailable"; quote: OrderQuote };

export async function createStripeCheckout(input: {
  items: RentalItemInput[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  locale: CheckoutLocale;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  const reservationId = nanoid(24);
  const cancelToken = randomBytes(24).toString("base64url");
  const expiresAtSeconds =
    Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_MINUTES * 60;

  const hold = await createReservationHold({
    id: reservationId,
    items: input.items,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    notes: input.notes,
    currency: ENV.stripeCurrency,
    cancelTokenHash: hashCancellationToken(cancelToken),
    sessionExpiresAt: new Date(expiresAtSeconds * 1000),
  });
  if (hold.status === "unavailable") return hold;

  const successUrl = checkoutPageUrl();
  successUrl.searchParams.set("checkout", "success");
  const successUrlWithSession = `${successUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`;

  const cancelUrl = checkoutPageUrl();
  cancelUrl.searchParams.set("checkout", "cancelled");
  cancelUrl.hash = new URLSearchParams({
    reservation_id: reservationId,
    cancel_token: cancelToken,
  }).toString();

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: input.customerEmail,
        client_reference_id: reservationId,
        metadata: { reservationId },
        payment_intent_data: { metadata: { reservationId } },
        line_items: lineItems(hold.quote, input.locale),
        success_url: successUrlWithSession,
        cancel_url: cancelUrl.toString(),
        expires_at: expiresAtSeconds,
        locale: input.locale,
        submit_type: "book",
      },
      { idempotencyKey: `studio-reservation:${reservationId}` }
    );
  } catch (error) {
    await releaseReservationHold(reservationId).catch(() => undefined);
    console.error("Stripe Checkout session creation failed", {
      reservationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new BookingError(
      "INTERNAL_SERVER_ERROR",
      "Payment checkout could not be started. Please try again."
    );
  }

  if (!session.url) {
    await releaseReservationHold(reservationId).catch(() => undefined);
    throw new BookingError(
      "INTERNAL_SERVER_ERROR",
      "Stripe did not return a checkout URL."
    );
  }

  try {
    await attachCheckoutSession(reservationId, session.id);
  } catch (error) {
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    await releaseReservationHold(reservationId).catch(() => undefined);
    throw error;
  }

  return { status: "redirect", checkoutUrl: session.url };
}

export async function fulfillCheckoutSession(
  checkoutSessionId: string
): Promise<ReservationSummary> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  const reservationId = getReservationId(session);

  if (session.payment_status !== "paid") {
    if (session.status === "expired")
      await expireReservationBySession(session.id);
    return getReservationSummary(reservationId);
  }

  if (session.amount_total == null || !session.currency) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "Stripe session is missing payment totals."
    );
  }

  return markReservationPaid({
    reservationId,
    checkoutSessionId: session.id,
    paymentIntentId: getPaymentIntentId(session),
    amountTotal: session.amount_total,
    currency: session.currency,
  });
}

export async function cancelStripeCheckout(input: {
  reservationId: string;
  cancelToken: string;
}): Promise<ReservationSummary> {
  const reservation = await getReservationRecord(input.reservationId);
  if (
    !reservation ||
    !tokenMatches(input.cancelToken, reservation.cancelTokenHash)
  ) {
    throw new BookingError(
      "NOT_FOUND",
      "The cancellation link is invalid or has expired."
    );
  }

  if (reservation.status === "paid")
    return getReservationSummary(input.reservationId);

  if (reservation.stripeCheckoutSessionId) {
    const stripe = getStripe();
    let session: Stripe.Checkout.Session;

    try {
      session = await stripe.checkout.sessions.retrieve(
        reservation.stripeCheckoutSessionId
      );
    } catch {
      // Never release inventory when Stripe cannot confirm the session state.
      throw new BookingError(
        "PRECONDITION_FAILED",
        "Checkout could not be cancelled safely. Please retry shortly."
      );
    }

    if (session.payment_status === "paid")
      return fulfillCheckoutSession(session.id);

    if (session.status === "complete") {
      // A completed session can still have an asynchronous payment in flight.
      throw new BookingError(
        "PRECONDITION_FAILED",
        "Payment is still being processed. This reservation cannot be cancelled yet."
      );
    }

    if (session.status === "open") {
      try {
        session = await stripe.checkout.sessions.expire(session.id);
      } catch {
        try {
          session = await stripe.checkout.sessions.retrieve(session.id);
        } catch {
          throw new BookingError(
            "PRECONDITION_FAILED",
            "Checkout could not be cancelled safely. Please retry shortly."
          );
        }
      }
      if (session.payment_status === "paid")
        return fulfillCheckoutSession(session.id);
    }

    if (session.status !== "expired") {
      // An open or complete session may still settle; keep the hold.
      throw new BookingError(
        "PRECONDITION_FAILED",
        "Checkout could not be cancelled safely. Please retry shortly."
      );
    }
  }

  await releaseReservationHold(input.reservationId, "cancelled");
  return getReservationSummary(input.reservationId);
}

export const stripeWebhookHandler: RequestHandler = async (req, res) => {
  if (!ENV.stripeWebhookSecret) {
    res.status(503).send("Stripe webhook is not configured.");
    return;
  }

  const signatureHeader = req.headers["stripe-signature"];
  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).send("Invalid webhook request.");
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      signature,
      ENV.stripeWebhookSecret
    );
  } catch (error) {
    console.warn("Stripe webhook signature verification failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(400).send("Invalid webhook signature.");
    return;
  }

  try {
    const session = event.type.startsWith("checkout.session.")
      ? (event.data.object as Stripe.Checkout.Session)
      : null;
    // Class-pass Payment Links share the Stripe account; only studio
    // reservations carry a reservation reference.
    const isReservation = Boolean(
      session &&
      (session.metadata?.reservationId || session.client_reference_id)
    );

    switch (isReservation ? event.type : "ignored") {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckoutSession((session as Stripe.Checkout.Session).id);
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await expireReservationBySession(
          (session as Stripe.Checkout.Session).id
        );
        break;
      default:
        break;
    }
  } catch (error) {
    if (error instanceof BookingError && error.code === "NOT_FOUND") {
      // Sessions from other integrations on the same Stripe account.
      res.status(200).json({ received: true, ignored: true });
      return;
    }
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).send("Webhook processing failed.");
    return;
  }

  res.status(200).json({ received: true });
};
