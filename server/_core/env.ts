import { randomBytes } from "node:crypto";

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  throw new Error(`Invalid boolean environment value: ${value}`);
}

function readNonNegativeInteger(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative integer environment value: ${value}`);
  }
  return parsed;
}

function normalizeAppUrl(value: string | undefined): string {
  const candidate = (value || "http://localhost:3000").trim();
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error(
      "APP_URL must be an absolute URL, such as http://localhost:3000"
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("APP_URL must use http or https");
  }

  return url.origin;
}

function normalizeCurrency(value: string | undefined): string {
  const currency = (value || "cad").trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error("STRIPE_CURRENCY must be a three-letter ISO currency code");
  }
  return currency;
}

const isProduction = process.env.NODE_ENV === "production";
const configuredSessionSecret = (
  process.env.ADMIN_SESSION_SECRET ||
  process.env.JWT_SECRET ||
  ""
).trim();

export const ENV = {
  isProduction,
  appUrl: normalizeAppUrl(process.env.APP_URL),
  databaseUrl: process.env.DATABASE_URL ?? "",
  databaseSsl: readBoolean(process.env.DATABASE_SSL, true),
  trustProxyHops: readNonNegativeInteger(process.env.TRUST_PROXY_HOPS, 0),

  /** Admin panel password. Change it with ADMIN_PASSWORD before launch. */
  adminPassword: (process.env.ADMIN_PASSWORD ?? "").trim() || "0000",
  adminPasswordIsDefault: !(process.env.ADMIN_PASSWORD ?? "").trim(),
  /**
   * Signs admin session cookies. Development falls back to a per-process
   * random secret, so admin sessions end when the dev server restarts.
   */
  sessionSecret:
    configuredSessionSecret.length >= 32
      ? configuredSessionSecret
      : isProduction
        ? configuredSessionSecret
        : randomBytes(48).toString("base64url"),

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripeCurrency: normalizeCurrency(process.env.STRIPE_CURRENCY),
  stripeTestModeOnly: readBoolean(process.env.STRIPE_TEST_MODE_ONLY, true),
};

export function validateRuntimeConfiguration(): void {
  if (!ENV.isProduction) return;

  const errors: string[] = [];
  if (!ENV.databaseUrl) errors.push("DATABASE_URL is required");
  if (ENV.sessionSecret.length < 32) {
    errors.push(
      "JWT_SECRET (or ADMIN_SESSION_SECRET) must contain at least 32 characters"
    );
  }
  if (!ENV.appUrl.startsWith("https://")) {
    errors.push("APP_URL must use HTTPS in production");
  }
  if (!ENV.stripeSecretKey) errors.push("STRIPE_SECRET_KEY is required");
  if (!ENV.stripeWebhookSecret.startsWith("whsec_")) {
    errors.push("STRIPE_WEBHOOK_SECRET must be a Stripe signing secret");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration: ${errors.join("; ")}`);
  }

  if (ENV.adminPasswordIsDefault) {
    console.warn(
      "ADMIN_PASSWORD is not set; the admin panel uses the default password. Set ADMIN_PASSWORD before launch."
    );
  }
}
