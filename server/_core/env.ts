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

function normalizeOptionalUrl(
  value: string | undefined,
  variableName: string
): string {
  const candidate = value?.trim();
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return candidate.replace(/\/+$/, "");
  } catch {
    throw new Error(`${variableName} must be an absolute HTTP(S) URL`);
  }
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

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  databaseSsl: readBoolean(process.env.DATABASE_SSL, true),
  oAuthServerUrl: normalizeOptionalUrl(
    process.env.OAUTH_SERVER_URL,
    "OAUTH_SERVER_URL"
  ),
  oauthPortalUrl: normalizeOptionalUrl(
    process.env.OAUTH_PORTAL_URL ?? process.env.VITE_OAUTH_PORTAL_URL,
    "OAUTH_PORTAL_URL"
  ),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  appUrl: normalizeAppUrl(process.env.APP_URL),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripeCurrency: normalizeCurrency(process.env.STRIPE_CURRENCY),
  stripeTestModeOnly: readBoolean(process.env.STRIPE_TEST_MODE_ONLY, true),
  trustProxyHops: readNonNegativeInteger(process.env.TRUST_PROXY_HOPS, 0),

  // Kept for compatibility with optional Manus helper modules. The cleanup
  // script removes those unused helpers from this project.
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

export function validateRuntimeConfiguration(): void {
  if (!ENV.isProduction) return;

  const errors: string[] = [];
  if (!ENV.databaseUrl) errors.push("DATABASE_URL is required");
  if (!ENV.appId) errors.push("VITE_APP_ID is required");
  if (!ENV.oAuthServerUrl) errors.push("OAUTH_SERVER_URL is required");
  if (!ENV.oauthPortalUrl) errors.push("OAUTH_PORTAL_URL is required");
  if (ENV.cookieSecret.length < 32) {
    errors.push("JWT_SECRET must contain at least 32 characters");
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
}
