import { useTranslation } from "react-i18next";
import { minutesToTime, SLOT_MINUTES, type SlotStatus } from "@shared/booking";
import { cx } from "@/lib/cx";
import { useFormat } from "@/lib/format";

export type SlotView = SlotStatus | "in_cart";

type TimeGridProps = {
  spaceName: string;
  rangeStart: number;
  slots: SlotView[];
  startIndex: number | null;
  endIndex: number | null;
  previewEndIndex: number | null;
  onPick: (index: number) => void;
  onHover: (index: number | null) => void;
};

/** Clickable 30-minute cells. Pick a start, then an end. */
export default function TimeGrid({
  spaceName,
  rangeStart,
  slots,
  startIndex,
  endIndex,
  previewEndIndex,
  onPick,
  onHover,
}: TimeGridProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const lastSelected = endIndex ?? startIndex;

  return (
    <div
      className="time-grid"
      role="group"
      aria-label={t("rental.grid.label", { name: spaceName })}
      onMouseLeave={() => onHover(null)}
    >
      {slots.map((status, index) => {
        const time = minutesToTime(rangeStart + index * SLOT_MINUTES);
        const selectable = status === "available";
        const isStart = index === startIndex;
        const isEnd = endIndex !== null && index === endIndex;
        const inRange =
          startIndex !== null &&
          lastSelected !== null &&
          index > startIndex &&
          index < lastSelected;
        const inPreview =
          startIndex !== null &&
          previewEndIndex !== null &&
          index > startIndex &&
          index <= previewEndIndex;
        const selected = isStart || isEnd || inRange;

        return (
          <button
            key={index}
            type="button"
            className={cx(
              "time-slot",
              `time-slot--${status.replace("_", "-")}`,
              selected && "time-slot--selected",
              isStart && "time-slot--range-start",
              isEnd && "time-slot--range-end",
              inRange && "time-slot--in-range",
              !selected && inPreview && "time-slot--preview"
            )}
            disabled={!selectable}
            aria-pressed={selectable ? selected : undefined}
            aria-label={`${format.time(time)}, ${t(`rental.slot.${status}`)}`}
            onClick={() => onPick(index)}
            onMouseEnter={() => onHover(index)}
            onFocus={() => onHover(index)}
          >
            {format.time(time)}
          </button>
        );
      })}
    </div>
  );
}
