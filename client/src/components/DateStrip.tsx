import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, daysBetween } from "@shared/booking";
import { cx } from "@/lib/cx";
import { useFormat } from "@/lib/format";

type DateStripProps = {
  selected: string;
  today: string;
  lastDate: string;
  onSelect: (date: string) => void;
  /** Label for the group of day buttons, read by screen readers. */
  label: string;
  /** "circles" (rentals) or "tabs": weekday and date with an underline. */
  variant?: "circles" | "tabs";
  /** Dates after this one can be looked at but not booked. */
  viewOnlyAfter?: string;
  /** Added to the accessible name of those dates. */
  viewOnlyLabel?: string;
};

const DAYS_SHOWN = 7;

/** A week of dates with previous/next controls, like a booking calendar header. */
export default function DateStrip({
  selected,
  today,
  lastDate,
  onSelect,
  label,
  variant = "circles",
  viewOnlyAfter,
  viewOnlyLabel,
}: DateStripProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [weekStart, setWeekStart] = useState(
    selected < today ? today : selected
  );

  // Keep the selected date visible when it changes from outside.
  useEffect(() => {
    const offset = daysBetween(weekStart, selected);
    if (offset < 0 || offset >= DAYS_SHOWN) {
      setWeekStart(selected);
    }
  }, [selected, weekStart]);

  const days = Array.from({ length: DAYS_SHOWN }, (_, index) =>
    addDays(weekStart, index)
  );
  const canGoBack = weekStart > today;
  const canGoForward = addDays(weekStart, DAYS_SHOWN) <= lastDate;

  function shiftWeek(direction: -1 | 1) {
    const candidate = addDays(weekStart, direction * DAYS_SHOWN);
    const start = candidate < today ? today : candidate;
    setWeekStart(start);
    onSelect(start);
  }

  const tabs = variant === "tabs";

  return (
    <div className={cx("date-strip", tabs && "date-strip--tabs")}>
      {!tabs && (
        <div className="date-strip__header">
          <p className="date-strip__month" aria-live="polite">
            {format.monthYear(selected)}
          </p>
          {selected !== today && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => onSelect(today)}
            >
              {t("common.today")}
            </button>
          )}
        </div>
      )}
      <div className="date-strip__week">
        <button
          type="button"
          className="icon-button"
          onClick={() => shiftWeek(-1)}
          disabled={!canGoBack}
          aria-label={t("common.previousWeek")}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="date-strip__days" role="group" aria-label={label}>
          {days.map(day => {
            const unavailable = day < today || day > lastDate;
            const viewOnly = viewOnlyAfter !== undefined && day > viewOnlyAfter;
            const name = format.fullDate(day);
            return (
              <button
                key={day}
                type="button"
                className={cx(
                  "date-strip__day",
                  day === selected && "date-strip__day--selected",
                  day === today && "date-strip__day--today",
                  viewOnly && "date-strip__day--view-only"
                )}
                aria-pressed={day === selected}
                aria-label={
                  viewOnly && viewOnlyLabel ? `${name}, ${viewOnlyLabel}` : name
                }
                title={viewOnly ? viewOnlyLabel : undefined}
                disabled={unavailable}
                onClick={() => onSelect(day)}
              >
                {tabs ? (
                  <>
                    <span className="date-strip__weekday">
                      <span className="date-strip__long">
                        {day === today
                          ? t("common.today")
                          : format.weekdayLong(day)}
                      </span>
                      <span className="date-strip__short">
                        {format.weekdayShort(day)}
                      </span>
                    </span>
                    <span className="date-strip__date">
                      <span className="date-strip__long">
                        {format.monthDay(day)}
                      </span>
                      <span className="date-strip__short">
                        {format.dayNumber(day)}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="date-strip__weekday">
                      {format.weekdayShort(day)}
                    </span>
                    <span className="date-strip__number">
                      {format.dayNumber(day)}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => shiftWeek(1)}
          disabled={!canGoForward}
          aria-label={t("common.nextWeek")}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
