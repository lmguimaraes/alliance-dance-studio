import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  addDays,
  daysBetween,
  LAST_BOOKABLE_DAY,
  MAX_REPEAT_WEEKS,
  minutesToTime,
  SLOT_MINUTES,
  type Audience,
} from "@shared/booking";
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
  rangeStart: number;
  slots: SlotView[];
  audience: Audience;
  currency: string;
  selection: RangeSelection;
  previewEndIndex: number | null;
  weeks: number;
  notice: string | null;
  isAdding: boolean;
  onPick: (index: number) => void;
  onHover: (index: number | null) => void;
  onWeeksChange: (weeks: number) => void;
  onAdd: () => void;
  onClear: () => void;
};

export default function StudioCard({
  space,
  date,
  today,
  rangeStart,
  slots,
  audience,
  currency,
  selection,
  previewEndIndex,
  weeks,
  notice,
  isAdding,
  onPick,
  onHover,
  onWeeksChange,
  onAdd,
  onClear,
}: StudioCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const isActive = selection.spaceKey === space.key;
  const startIndex = isActive ? selection.startIndex : null;
  const endIndex = isActive ? selection.endIndex : null;
  const rate = audience === "group" ? space.groupHourlyRate : space.hourlyRate;
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
          onPick={onPick}
          onHover={onHover}
        />
      ) : (
        <p className="studio-card__closed">{t("rental.closedDay")}</p>
      )}

      {isOpen && (
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

          {startIndex !== null && (
            <div className="repeat-picker">
              <span className="repeat-picker__label" id={`${space.key}-repeat`}>
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
                  const lastDate = addDays(date, (count - 1) * 7);
                  const tooFar =
                    daysBetween(today, lastDate) > LAST_BOOKABLE_DAY;
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
