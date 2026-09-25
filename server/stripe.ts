import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { nanoid } from "nanoid";
import Stripe from "stripe";
import { ENV } from "./_core/env";
import {
  isStudioXCombination,
  STUDIO_X_DESCRIPTION,
  STUDIO_X_NAME,
} from "../shared/studioCatalog";
import {
  BookingError,
  CHECKOUT_SESSION_MINUTES,
} from "./bookingPolicy";
import {
  attachCheckoutSession,
  createReservationHold,
  expireReservationBySession,
  getReservationForCancellation,
  getReservationSummary,
  markReservationPaid,
  releaseReservationHold,
  type ReservationSummary,
} from "./bookingRepository";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!ENV.stripeSecretKey) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "Stripe is not configured on the server."
    );
  }
  if (
    ENV.stripeTestModeOnly &&
    !ENV.stripeSecretKey.startsWith("sk_test_")
  ) {
    throw new BookingError(
      "PRECONDITION_FAILED",
      "This deployment only accepts a Stripe test-mode secret key."
    );
  }

  stripeClient ??= new Stripe(ENV.stripeSecretKey);
  return stripeClient;
}

export function hashCancellationToken(token: string): string {
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

function studioRentalUrl(): URL {
  return new URL("/studio-rental", ENV.appUrl);
}

export async function createStripeCheckout(input: {
  studioIds: number[];
  date: string;
  startTime: string;
  endTime: string;
  audience: "private" | "group";
  userName: string;
  userEmail: string;
  userPhone?: string;
  specialRequests?: string;
}): Promise<{ checkoutUrl: string }> {
  const stripe = getStripe();
  const reservationId = nanoid(24);
  const cancelToken = randomBytes(24).toString("base64url");
  const expiresAtSeconds =
    Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_MINUTES * 60;
  const sessionExpiresAt = new Date(expiresAtSeconds * 1000);

  const hold = await createReservationHold({
    ...input,
    id: reservationId,
    currency: ENV.stripeCurrency,
    cancelTokenHash: hashCancellationToken(cancelToken),
    sessionExpiresAt,
  });

  const successUrl = studioRentalUrl();
  successUrl.searchParams.set("checkout", "success");
  const successUrlWithSession =
    `${successUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`;

  const cancelUrl = studioRentalUrl();
  cancelUrl.searchParams.set("checkout", "cancelled");
  cancelUrl.hash = new URLSearchParams({
    reservation_id: reservationId,
    cancel_token: cancelToken,
  }).toString();

  const lineItems =
    isStudioXCombination(hold.lines.map(line => line.studioName))
      ? [
          {
            quantity: 1,
            price_data: {
              currency: hold.currency,
              unit_amount: hold.amountTotal,
              product_data: {
                name: `${STUDIO_X_NAME} rental`,
                description:
                  `${STUDIO_X_DESCRIPTION} ` +
                  `${hold.date}, ${hold.startTime}-${hold.endTime} ` +
                  `(${hold.audience}).`,
              },
            },
          },
        ]
      : hold.lines.map(line => ({
          quantity: 1,
          price_data: {
            currency: hold.currency,
            unit_amount: line.lineTotal,
            product_data: {
              name: `${line.studioName} rental`,
              description:
                `${hold.date}, ${hold.startTime}-${hold.endTime} ` +
                `(${hold.audience})`,
            },
          },
        }));

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: input.userEmail,
        client_reference_id: reservationId,
        metadata: { reservationId },
        payment_intent_data: {
          metadata: { reservationId },
        },
        line_items: lineItems,
        success_url: successUrlWithSession,
        cancel_url: cancelUrl.toString(),
        expires_at: expiresAtSeconds,
        locale: "auto",
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

  return { checkoutUrl: session.url };
}

export async function fulfillCheckoutSession(
  checkoutSessionId: string
): Promise<ReservationSummary> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  const reservationId = getReservationId(session);

  if (session.payment_status !== "paid") {
    if (session.status === "expired") {
      await expireReservationBySession(session.id);
    }
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
  const reservation = await getReservationForCancellation(input.reservationId);
  if (
    !reservation ||
    !tokenMatches(input.cancelToken, reservation.cancelTokenHash)
  ) {
    throw new BookingError(
      "NOT_FOUND",
      "The cancellation link is invalid or has expired."
    );
  }

  if (reservation.status === "paid") {
    return getReservationSummary(input.reservationId);
  }

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

    if (session.payment_status === "paid") {
      return fulfillCheckoutSession(session.id);
    }

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

      if (session.payment_status === "paid") {
        return fulfillCheckoutSession(session.id);
      }
    }

    if (session.status !== "expired") {
      // A session that is still open or complete may still accept/settle payment.
      // Releasing the database hold here would reintroduce double-booking risk.
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
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillCheckoutSession(
          (event.data.object as Stripe.Checkout.Session).id
        );
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await expireReservationBySession(
          (event.data.object as Stripe.Checkout.Session).id
        );
        break;
      default:
        break;
    }
  } catch (error) {
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
