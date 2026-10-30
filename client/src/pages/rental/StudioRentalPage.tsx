import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import {
  addDays,
  AVAILABILITY_VIEW_DAYS,
  BOOKING_WINDOW_DAYS,
  intervalsOverlap,
  MAX_BOOKING_MINUTES,
  minutesToTime,
  SLOT_MINUTES,
  studioNow,
  type Audience,
  type OccurrenceProblem,
} from "@shared/booking";
import DateStrip from "@/components/DateStrip";
import PageHeader from "@/components/PageHeader";
import { useCart } from "@/features/cart/CartContext";
import { cartIntervalsFor, cartTotal } from "@/features/cart/cartModel";
import {
  EMPTY_SELECTION,
  previewEnd,
  reconcileSelection,
  selectionReducer,
  type SelectionNotice,
} from "@/features/rental/rangeSelection";
import StudioCard from "@/features/rental/StudioCard";
import type { SlotView } from "@/features/rental/TimeGrid";
import { PATHS } from "@/lib/brand";
import { useFormat, type Formatters } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/usePageMeta";
import "@/features/cart/cart.css";
import "./studio-rental.css";

const MAX_SLOTS = MAX_BOOKING_MINUTES / SLOT_MINUTES;

type CardMessage = { spaceKey: string; text: string };

export default function StudioRentalPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const utils = trpc.useUtils();
  const { cart, add, open: openCart } = useCart();
  usePageMeta(t("rental.title"), t("rental.intro"));

  const today = useMemo(() => studioNow().dateKey, []);
  // Availability can be browsed further ahead than it can be booked.
  const lastDate = addDays(today, AVAILABILITY_VIEW_DAYS);
  const lastBookable = addDays(today, BOOKING_WINDOW_DAYS);
  const [date, setDate] = useState(today);
  const [selection, dispatch] = useReducer(selectionReducer, EMPTY_SELECTION);
  const [hover, setHover] = useState<{
    spaceKey: string;
    index: number;
  } | null>(null);
  // Remembered between selections: most people book at one rate.
  const [audience, setAudience] = useState<Audience>("private");
  const [weeks, setWeeks] = useState(1);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [message, setMessage] = useState<CardMessage | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const dayQuery = trpc.rental.day.useQuery(
    { date },
    { refetchInterval: 30_000, staleTime: 10_000 }
  );
  const day = dayQuery.data?.date === date ? dayQuery.data : undefined;

  // Slot status per space, including time already in the cart.
  const slotsBySpace = useMemo(() => {
    const result = new Map<string, SlotView[]>();
    if (!day) return result;
    for (const space of day.spaces) {
      const inCart = cartIntervalsFor(cart.items, space.studioIds, date);
      result.set(
        space.key,
        space.slots.map((status, index) => {
          const start = day.range.start + index * SLOT_MINUTES;
          const cell = { start, end: start + SLOT_MINUTES };
          return status === "available" &&
            inCart.some(interval => intervalsOverlap(interval, cell))
            ? "in_cart"
            : status;
        })
      );
    }
    return result;
  }, [cart.items, date, day]);

  const selectableFor = (spaceKey: string) =>
    (slotsBySpace.get(spaceKey) ?? []).map(status => status === "available");

  // Late in the day, open on tomorrow when nothing is left to book today.
  const checkedToday = useRef(false);
  useEffect(() => {
    if (checkedToday.current || !day || day.date !== today) return;
    checkedToday.current = true;
    const nothingLeft = day.spaces.every(
      space => !space.slots.includes("available")
    );
    if (nothingLeft && day.spaces.length > 0) setDate(addDays(today, 1));
  }, [day, today]);

  // Weekly repeats are opt-in for each selection.
  function resetExtras() {
    setWeeks(1);
    setExtrasOpen(false);
  }

  // A new date starts a new selection.
  useEffect(() => {
    dispatch({ type: "clear" });
    resetExtras();
    setMessage(null);
  }, [date]);

  // Drop a selection that was just booked by someone else.
  const announcedLoss = useRef(false);
  useEffect(() => {
    if (!selection.spaceKey || !day) return;
    const reconciled = reconcileSelection(
      selection,
      selection.spaceKey,
      selectableFor(selection.spaceKey)
    );
    if (reconciled !== selection) {
      dispatch({ type: "clear" });
      resetExtras();
      if (!announcedLoss.current) {
        announcedLoss.current = true;
        setMessage({
          spaceKey: selection.spaceKey,
          text: t("rental.selection.lost"),
        });
      }
    } else {
      announcedLoss.current = false;
    }
    // selectableFor is derived from slotsBySpace.
  }, [slotsBySpace, selection, day]);

  useEffect(() => {
    if (!selection.spaceKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "clear" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection.spaceKey]);

  function noticeText(notice: SelectionNotice | null): string | null {
    if (!notice || !day) return null;
    switch (notice.kind) {
      case "pick_end":
        return null;
      case "end_before_start":
        return t("rental.selection.endBeforeStart", {
          time: format.time(
            minutesToTime(
              day.range.start + (selection.startIndex ?? 0) * SLOT_MINUTES
            )
          ),
        });
      case "range_blocked":
        return t("rental.selection.blocked", {
          time: format.time(
            minutesToTime(
              day.range.start + notice.firstBlockedIndex * SLOT_MINUTES
            )
          ),
        });
      case "too_long":
        return t("rental.selection.tooLong", {
          hours: MAX_BOOKING_MINUTES / 60,
        });
    }
  }

  function pick(spaceKey: string, index: number) {
    if (selection.spaceKey !== spaceKey) resetExtras();
    setMessage(null);
    dispatch({
      type: "pick",
      spaceKey,
      index,
      selectable: selectableFor(spaceKey),
      maxSlots: MAX_SLOTS,
    });
  }

  async function addSelection() {
    if (
      !day ||
      selection.spaceKey === null ||
      selection.startIndex === null ||
      selection.endIndex === null
    )
      return;
    const space = day.spaces.find(item => item.key === selection.spaceKey);
    if (!space) return;

    const startTime = minutesToTime(
      day.range.start + selection.startIndex * SLOT_MINUTES
    );
    const endTime = minutesToTime(
      day.range.start + (selection.endIndex + 1) * SLOT_MINUTES
    );
    const item = {
      studioIds: space.studioIds,
      audience,
      date,
      startTime,
      endTime,
      weeks,
    };

    setIsAdding(true);
    setMessage(null);
    try {
      const quote = await utils.rental.quote.fetch({ items: [item] });
      const problems = quote.items[0].occurrences.filter(
        occurrence => occurrence.problem
      );
      if (problems.length) {
        setMessage({
          spaceKey: space.key,
          text: describeProblems(problems, format, t),
        });
        void dayQuery.refetch();
        return;
      }

      const result = add({
        ...item,
        spaceKey: space.key,
        spaceName: space.name,
        hourlyRate: space.hourlyRate,
        groupHourlyRate: space.groupHourlyRate,
      });
      if (!result.ok) {
        setMessage({
          spaceKey: space.key,
          text:
            result.reason === "full"
              ? t("rental.cartFull")
              : t("rental.cartConflict", {
                  date: format.shortDate(result.conflictDate ?? date),
                }),
        });
        return;
      }

      dispatch({ type: "clear" });
      resetExtras();
      toast.success(t("rental.added", { name: space.name }), {
        action: { label: t("cart.view"), onClick: openCart },
      });
    } catch {
      setMessage({ spaceKey: space.key, text: t("rental.checkFailed") });
    } finally {
      setIsAdding(false);
    }
  }

  const cartCount = cart.items.length;

  return (
    <>
      <PageHeader title={t("rental.title")} intro={t("rental.intro")} />

      <section
        className="container studio-rental"
        aria-label={t("rental.title")}
      >
        <div className="rental-toolbar">
          <DateStrip
            selected={date}
            today={today}
            lastDate={lastDate}
            onSelect={setDate}
            label={t("rental.chooseDay")}
            viewOnlyAfter={lastBookable}
            viewOnlyLabel={t("rental.window.viewOnly")}
          />
          <ul
            className="availability-legend"
            role="list"
            aria-label={t("rental.legend.label")}
          >
            <li className="availability-legend__item availability-legend__item--available">
              {t("rental.slot.available")}
            </li>
            <li className="availability-legend__item availability-legend__item--selected">
              {t("rental.slot.selected")}
            </li>
            <li className="availability-legend__item availability-legend__item--booked">
              {t("rental.slot.booked")}
            </li>
            <li className="availability-legend__item availability-legend__item--in-cart">
              {t("rental.slot.in_cart")}
            </li>
          </ul>
          <p className="rental-toolbar__note">
            {t("rental.timeZoneNote")}{" "}
            {t("rental.window.note", { days: BOOKING_WINDOW_DAYS })}
          </p>
        </div>

        {day && !day.bookable && (
          <div className="booking-window-notice" role="status">
            <CalendarClock aria-hidden="true" />
            <div>
              <strong>
                {t("rental.window.title", {
                  date: format.longDate(day.bookingOpensOn),
                })}
              </strong>
              <p>
                {t("rental.window.body", {
                  days: BOOKING_WINDOW_DAYS,
                  date: format.longDate(day.date),
                })}
              </p>
            </div>
          </div>
        )}

        {dayQuery.error && !day ? (
          <div className="notice notice--error" role="alert">
            <strong>{t("errors.loadTitle")}</strong>
            {t("rental.loadFailed")}{" "}
            <button
              type="button"
              className="button button--quiet"
              onClick={() => void dayQuery.refetch()}
            >
              {t("common.retry")}
            </button>
          </div>
        ) : !day ? (
          <div className="studio-grid" aria-busy="true">
            {[0, 1, 2, 3].map(index => (
              <div key={index} className="skeleton studio-card--skeleton" />
            ))}
          </div>
        ) : day.spaces.length === 0 ? (
          <p className="empty-state">{t("rental.noStudios")}</p>
        ) : (
          <div className="studio-grid">
            {day.spaces.map(space => (
              <StudioCard
                key={space.key}
                space={space}
                date={date}
                today={today}
                bookable={day.bookable}
                bookingOpensOn={day.bookingOpensOn}
                rangeStart={day.range.start}
                slots={slotsBySpace.get(space.key) ?? []}
                audience={audience}
                currency={day.currency}
                selection={selection}
                previewEndIndex={
                  hover?.spaceKey === space.key
                    ? previewEnd(
                        selection,
                        space.key,
                        hover.index,
                        selectableFor(space.key),
                        MAX_SLOTS
                      )
                    : null
                }
                weeks={selection.spaceKey === space.key ? weeks : 1}
                extrasOpen={selection.spaceKey === space.key && extrasOpen}
                notice={
                  message?.spaceKey === space.key
                    ? message.text
                    : selection.spaceKey === space.key
                      ? noticeText(selection.notice)
                      : null
                }
                isAdding={isAdding && selection.spaceKey === space.key}
                onPick={index => pick(space.key, index)}
                onHover={index =>
                  setHover(
                    index === null ? null : { spaceKey: space.key, index }
                  )
                }
                onAudienceChange={setAudience}
                onExtrasToggle={() => {
                  // Closing the options drops the repeat.
                  if (extrasOpen) setWeeks(1);
                  setExtrasOpen(!extrasOpen);
                }}
                onWeeksChange={setWeeks}
                onAdd={() => void addSelection()}
                onClear={() => {
                  dispatch({ type: "clear" });
                  resetExtras();
                  setMessage(null);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {cartCount > 0 && (
        <div className="cart-bar" role="region" aria-label={t("cart.title")}>
          <div className="container cart-bar__inner">
            <p className="cart-bar__summary">
              <span>{t("cart.count", { count: cartCount })}</span>
              <strong className="tabular">
                {format.money(cartTotal(cart), day?.currency)}
              </strong>
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button button--outline button--small"
                onClick={openCart}
              >
                {t("cart.view")}
              </button>
              <Link
                href={PATHS.checkout}
                className="button button--primary button--small"
              >
                {t("cart.checkout")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function describeProblems(
  problems: { date: string; problem: OccurrenceProblem | null }[],
  format: Formatters,
  t: TFunction
): string {
  const dates = format.list(
    problems.map(problem => format.monthDay(problem.date))
  );
  const reasons = new Set(problems.map(problem => problem.problem));
  if (reasons.size === 1 && reasons.has("too_far"))
    return t("rental.problems.tooFar", { dates, days: BOOKING_WINDOW_DAYS });
  if (reasons.size === 1 && reasons.has("past"))
    return t("rental.problems.past");
  return t("rental.problems.unavailable", { dates, count: problems.length });
}
