import { useTranslation } from "react-i18next";
import { CalendarClock, ChevronDown, Loader2 } from "lucide-react";
import {
  addDays,
  BOOKING_WINDOW_DAYS,
  daysBetween,
  MAX_REPEAT_WEEKS,
  minutesToTime,
  SLOT_MINUTES,
  type Audience,
} from "@shared/booking";

const AUDIENCES: Audience[] = ["private", "group"];
import { cx } from "@/lib/cx";
import { useFormat } from "@/lib/format";
import type { RangeSelection } from "./rangeSelection";
import TimeGrid, { type SlotView } from "./TimeGrid";

export type RentalSpaceView = {
  key: string;
  studioIds: number[];
  name: string;
  isCombination: boolean;
  capacity: number | null;
  size: string | null;
  hourlyRate: number;
  groupHourlyRate: number;
};

type StudioCardProps = {
  space: RentalSpaceView;
  date: string;
  today: string;
  /** False past the booking window: the grid is shown but can't be picked. */
  bookable: boolean;
  bookingOpensOn: string;
  rangeStart: number;
  slots: SlotView[];
  audience: Audience;
  currency: string;
  selection: RangeSelection;
  previewEndIndex: number | null;
  weeks: number;
  extrasOpen: boolean;
  notice: string | null;
  isAdding: boolean;
  onPick: (index: number) => void;
  onHover: (index: number | null) => void;
  onAudienceChange: (audience: Audience) => void;
  onExtrasToggle: () => void;
  onWeeksChange: (weeks: number) => void;
  onAdd: () => void;
  onClear: () => void;
};

export default function StudioCard({
  space,
  date,
  today,
  bookable,
  bookingOpensOn,
  rangeStart,
  slots,
  audience,
  currency,
  selection,
  previewEndIndex,
  weeks,
  extrasOpen,
  notice,
  isAdding,
  onPick,
  onHover,
  onAudienceChange,
  onExtrasToggle,
  onWeeksChange,
  onAdd,
  onClear,
}: StudioCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const isActive = selection.spaceKey === space.key;
  const startIndex = isActive ? selection.startIndex : null;
  const endIndex = isActive ? selection.endIndex : null;
  const rateFor = (option: Audience) =>
    option === "group" ? space.groupHourlyRate : space.hourlyRate;
  const rate = rateFor(audience);
  const isOpen = slots.some(status => status !== "closed");
  const hasRange = startIndex !== null && endIndex !== null;

  const startTime =
    startIndex !== null
      ? minutesToTime(rangeStart + startIndex * SLOT_MINUTES)
      : null;
  const endTime = hasRange
    ? minutesToTime(rangeStart + (endIndex + 1) * SLOT_MINUTES)
    : null;
  const minutes = hasRange ? (endIndex - startIndex + 1) * SLOT_MINUTES : 0;
  const amount = Math.round((rate * minutes) / 60) * weeks;
  // Weekly repeats can't reach past the booking window either.
  const lastBookable = addDays(today, BOOKING_WINDOW_DAYS);
  const repeatFits = (count: number) =>
    daysBetween(lastBookable, addDays(date, (count - 1) * 7)) <= 0;
  const repeatLimited = !repeatFits(MAX_REPEAT_WEEKS);

  return (
    <article
      className={cx("studio-card", isActive && "studio-card--active")}
      aria-labelledby={`${space.key}-name`}
    >
      <header className="studio-card__header">
        <div>
          <h2 id={`${space.key}-name`} className="studio-card__name">
            {space.name}
          </h2>
          <p className="studio-card__facts">
            {space.isCombination && <span>{t("rental.combined")}</span>}
            {space.capacity ? (
              <span>{t("rental.capacity", { count: space.capacity })}</span>
            ) : null}
          </p>
        </div>
        <p className="studio-card__rate">
          <span className="tabular">{format.money(rate, currency)}</span>
          <span className="studio-card__rate-unit">{t("rental.perHour")}</span>
        </p>
      </header>

      {isOpen ? (
        <TimeGrid
          spaceName={space.name}
          rangeStart={rangeStart}
          slots={slots}
          startIndex={startIndex}
          endIndex={endIndex}
          previewEndIndex={isActive ? previewEndIndex : null}
          viewOnly={!bookable}
          onPick={onPick}
          onHover={onHover}
        />
      ) : (
        <p className="studio-card__closed">{t("rental.closedDay")}</p>
      )}

      {isOpen && !bookable && (
        <footer className="studio-card__footer">
          <p className="studio-card__opens">
            <CalendarClock aria-hidden="true" />
            {t("rental.window.cardNote", {
              date: format.monthDay(bookingOpensOn),
            })}
          </p>
        </footer>
      )}

      {isOpen && bookable && (
        <footer className="studio-card__footer">
          <div className="selection-summary" aria-live="polite">
            {hasRange && startTime && endTime ? (
              <p className="selection-summary__range">
                <span className="tabular">
                  {format.timeRange(startTime, endTime)}
                </span>
                <span className="selection-summary__duration">
                  {format.duration(minutes)}
                </span>
              </p>
            ) : (
              <p className="selection-summary__hint">
                {startIndex === null
                  ? t("rental.selection.pickStart")
                  : t("rental.selection.pickEnd")}
              </p>
            )}
            {notice && <p className="selection-summary__notice">{notice}</p>}
          </div>

          {hasRange && (
            <div className="audience-picker">
              <span
                className="audience-picker__label"
                id={`${space.key}-audience`}
              >
                {t("rental.audience.label")}
              </span>
              <div
                className="segmented"
                role="radiogroup"
                aria-labelledby={`${space.key}-audience`}
              >
                {AUDIENCES.map(option => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={audience === option}
                    className="segmented__option"
                    onClick={() => onAudienceChange(option)}
                  >
                    {t(`rental.audience.${option}`)}
                    <span className="audience-picker__rate tabular">
                      {t("rental.ratePerHour", {
                        amount: format.money(rateFor(option), currency),
                      })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasRange && (
            <div className="extra-options">
              <button
                type="button"
                className="extra-options__toggle"
                aria-expanded={extrasOpen}
                aria-controls={`${space.key}-extras`}
                onClick={onExtrasToggle}
              >
                {t("rental.extraOptions")}
                <ChevronDown
                  className="extra-options__chevron"
                  aria-hidden="true"
                />
              </button>
              {extrasOpen && (
                <div id={`${space.key}-extras`} className="repeat-picker">
                  <span
                    className="repeat-picker__label"
                    id={`${space.key}-repeat`}
                  >
                    {t("rental.repeat.label")}
                  </span>
                  <div
                    className="segmented"
                    role="radiogroup"
                    aria-labelledby={`${space.key}-repeat`}
                  >
                    {Array.from(
                      { length: MAX_REPEAT_WEEKS },
                      (_, index) => index + 1
                    ).map(count => {
                      const tooFar = !repeatFits(count);
                      return (
                        <button
                          key={count}
                          type="button"
                          role="radio"
                          aria-checked={weeks === count}
                          className="segmented__option"
                          disabled={tooFar}
                          aria-label={t("rental.repeat.weeks", { count })}
                          onClick={() => onWeeksChange(count)}
                        >
                          {count}
                        </button>
                      );
                    })}
                  </div>
                  <p className="repeat-picker__hint">
                    {weeks > 1
                      ? t("rental.repeat.until", {
                          date: format.monthDay(addDays(date, (weeks - 1) * 7)),
                        })
                      : t("rental.repeat.once")}
                  </p>
                  {repeatLimited && (
                    <p className="repeat-picker__hint">
                      {t("rental.repeat.windowLimit", {
                        days: BOOKING_WINDOW_DAYS,
                        date: format.monthDay(lastBookable),
                      })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="studio-card__actions">
            <button
              type="button"
              className="button button--primary"
              disabled={!hasRange || isAdding}
              onClick={onAdd}
            >
              {isAdding ? (
                <Loader2 className="spinner" aria-hidden="true" />
              ) : null}
              {hasRange
                ? t("rental.addToCartAmount", {
                    amount: format.money(amount, currency),
                  })
                : t("rental.addToCart")}
            </button>
            {startIndex !== null && (
              <button
                type="button"
                className="button button--quiet"
                onClick={onClear}
              >
                {t("rental.selection.clear")}
              </button>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}
