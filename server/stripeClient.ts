import Stripe from "stripe";
import { ENV } from "./_core/env";
import { BookingError } from "./booking/rules";

/** Stripe requires Checkout sessions to stay open for at least 30 minutes. */
export const CHECKOUT_SESSION_MINUTES = 31;

export type CheckoutLocale = "en" | "fr" | "es";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
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

export function getPaymentIntentId(
  session: Stripe.Checkout.Session
): string | null {
  if (!session.payment_intent) return null;
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent.id;
}

/** Link to a payment in the Stripe Dashboard, in test or live mode. */
export function stripePaymentUrl(paymentIntentId: string): string {
  const mode = ENV.stripeSecretKey.startsWith("sk_live_") ? "" : "test/";
  return `https://dashboard.stripe.com/${mode}payments/${paymentIntentId}`;
}

/** Seconds since the epoch at which a new Checkout session should expire. */
export function checkoutExpiry(): number {
  return Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_MINUTES * 60;
}
