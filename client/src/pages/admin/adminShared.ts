import { TRPCClientError } from "@trpc/client";
import type { TFunction } from "i18next";
import { toast } from "sonner";

/** Monday-first order for forms, using JavaScript's Sunday = 0 numbering. */
export const WEEKDAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

export function weekdayName(
  day: number,
  locale: string,
  style: "long" | "short" = "long"
): string {
  // 2026-10-18 is a Sunday.
  const date = new Date(Date.UTC(2026, 9, 18 + day, 12));
  return new Intl.DateTimeFormat(locale, {
    weekday: style,
    timeZone: "UTC",
  }).format(date);
}

export function centsToDollars(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= 0
    ? Math.round(number * 100)
    : null;
}

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Shows a translated toast for a failed admin request. */
export function reportAdminError(
  error: unknown,
  t: TFunction,
  onUnauthorized?: () => void
): void {
  const code =
    error instanceof TRPCClientError
      ? (error.data?.code as string | undefined)
      : undefined;
  if (code === "UNAUTHORIZED") {
    toast.error(t("admin.errors.session"));
    onUnauthorized?.();
    return;
  }
  const key =
    code === "CONFLICT"
      ? "admin.errors.conflict"
      : code === "NOT_FOUND"
        ? "admin.errors.notFound"
        : code === "BAD_REQUEST"
          ? "admin.errors.invalid"
          : code === "TOO_MANY_REQUESTS"
            ? "errors.tooMany"
            : "admin.errors.generic";
  const detail =
    code === "BAD_REQUEST" &&
    error instanceof Error &&
    !error.message.startsWith("[")
      ? error.message
      : "";
  toast.error(t(key), detail ? { description: detail } : undefined);
}
