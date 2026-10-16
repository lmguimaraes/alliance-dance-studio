import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { dateKeyToDate, timeToMinutes } from "@shared/booking";

export const SUPPORTED_LANGUAGES = ["en", "fr", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function currentLanguage(language: string | undefined): Language {
  const base = (language ?? "en").slice(0, 2).toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? (base as Language)
    : "en";
}

/** Canadian English and French; neutral Spanish. */
function localeTag(language: Language): string {
  return language === "es" ? "es" : `${language}-CA`;
}

function timeAsDate(time: string): Date {
  const minutes = timeToMinutes(time) % (24 * 60);
  return new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
}

export type Formatters = ReturnType<typeof createFormatters>;

function createFormatters(language: Language) {
  const locale = localeTag(language);
  const dateFormat = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });

  const longDate = dateFormat({
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const fullDate = dateFormat({
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const shortDate = dateFormat({
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const monthDay = dateFormat({ month: "short", day: "numeric" });
  const monthYear = dateFormat({ month: "long", year: "numeric" });
  const weekdayShort = dateFormat({ weekday: "short" });
  const dayNumber = dateFormat({ day: "numeric" });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const hours = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "hour",
    unitDisplay: "short",
  });
  const minutes = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  });

  return {
    language,
    locale,
    money(cents: number, currency = "cad"): string {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency.toUpperCase(),
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100);
    },
    longDate: (dateKey: string) => longDate.format(dateKeyToDate(dateKey)),
    fullDate: (dateKey: string) => fullDate.format(dateKeyToDate(dateKey)),
    shortDate: (dateKey: string) => shortDate.format(dateKeyToDate(dateKey)),
    monthDay: (dateKey: string) => monthDay.format(dateKeyToDate(dateKey)),
    monthYear: (dateKey: string) => monthYear.format(dateKeyToDate(dateKey)),
    weekdayShort: (dateKey: string) =>
      weekdayShort.format(dateKeyToDate(dateKey)),
    dayNumber: (dateKey: string) => dayNumber.format(dateKeyToDate(dateKey)),
    time: (value: string) => time.format(timeAsDate(value)),
    timeRange: (start: string, end: string) =>
      `${time.format(timeAsDate(start))} – ${time.format(timeAsDate(end))}`,
    duration(totalMinutes: number): string {
      const whole = Math.floor(totalMinutes / 60);
      const rest = totalMinutes % 60;
      if (!whole) return minutes.format(rest);
      if (!rest) return hours.format(whole);
      return `${hours.format(whole)} ${minutes.format(rest)}`;
    },
    list: (values: string[]) =>
      new Intl.ListFormat(locale, {
        style: "long",
        type: "conjunction",
      }).format(values),
  };
}

export function useFormat(): Formatters {
  const { i18n } = useTranslation();
  const language = currentLanguage(i18n.resolvedLanguage ?? i18n.language);
  return useMemo(() => createFormatters(language), [language]);
}

/** Picks the field for the current language, falling back to English. */
export function localized(
  language: Language,
  values: { en: string | null; fr: string | null; es: string | null }
): string {
  return (values[language] ?? "").trim() || (values.en ?? "").trim();
}
