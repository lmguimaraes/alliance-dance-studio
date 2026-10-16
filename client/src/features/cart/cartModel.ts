import {
  addDays,
  intervalsOverlap,
  isDateKey,
  isTime,
  MAX_CART_ITEMS,
  MAX_ORDER_OCCURRENCES,
  MAX_REPEAT_WEEKS,
  priceForMinutes,
  seriesDates,
  timeToMinutes,
  type Audience,
  type Interval,
  type RentalItemInput,
} from "@shared/booking";

export type CartItem = {
  id: string;
  spaceKey: string;
  studioIds: number[];
  spaceName: string;
  audience: Audience;
  /** First date of the weekly series. */
  date: string;
  startTime: string;
  endTime: string;
  weeks: number;
  /** Hourly rates in cents when the item was added; checkout uses live prices. */
  hourlyRate: number;
  groupHourlyRate: number;
};

export type CartState = {
  items: CartItem[];
};

export const EMPTY_CART: CartState = { items: [] };

export type Occurrence = { date: string; studioIds: number[] } & Interval;

function occurrencesOf(
  item: Pick<CartItem, "date" | "weeks" | "startTime" | "endTime" | "studioIds">
): Occurrence[] {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  return seriesDates(item.date, item.weeks).map(date => ({
    date,
    studioIds: item.studioIds,
    start,
    end,
  }));
}

function occurrenceCount(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + item.weeks, 0);
}

/** The cart item that overlaps the candidate in a shared studio, if any. */
export function findCartConflict(
  items: readonly CartItem[],
  candidate: Pick<
    CartItem,
    "date" | "weeks" | "startTime" | "endTime" | "studioIds"
  >
): { item: CartItem; date: string } | null {
  const wanted = occurrencesOf(candidate);
  for (const item of items) {
    for (const existing of occurrencesOf(item)) {
      const clash = wanted.find(
        occurrence =>
          occurrence.date === existing.date &&
          occurrence.studioIds.some(id => existing.studioIds.includes(id)) &&
          intervalsOverlap(occurrence, existing)
      );
      if (clash) return { item, date: clash.date };
    }
  }
  return null;
}

/** Cart time on `date` that touches any of `studioIds`. */
export function cartIntervalsFor(
  items: readonly CartItem[],
  studioIds: readonly number[],
  date: string
): Interval[] {
  return items
    .flatMap(occurrencesOf)
    .filter(
      occurrence =>
        occurrence.date === date &&
        occurrence.studioIds.some(id => studioIds.includes(id))
    )
    .map(({ start, end }) => ({ start, end }));
}

export function itemAmount(item: CartItem): number {
  const minutes = timeToMinutes(item.endTime) - timeToMinutes(item.startTime);
  const rate =
    item.audience === "group" ? item.groupHourlyRate : item.hourlyRate;
  return priceForMinutes(rate, minutes) * item.weeks;
}

export function cartTotal(state: CartState): number {
  return state.items.reduce((total, item) => total + itemAmount(item), 0);
}

export function lastDateOf(item: Pick<CartItem, "date" | "weeks">): string {
  return addDays(item.date, (item.weeks - 1) * 7);
}

export function toRentalItems(items: readonly CartItem[]): RentalItemInput[] {
  return items.map(
    ({ studioIds, audience, date, startTime, endTime, weeks }) => ({
      studioIds,
      audience,
      date,
      startTime,
      endTime,
      weeks,
    })
  );
}

export type AddResult =
  | { ok: true; state: CartState }
  | { ok: false; reason: "full" | "conflict"; conflictDate?: string };

export function addItem(state: CartState, item: CartItem): AddResult {
  if (
    state.items.length >= MAX_CART_ITEMS ||
    occurrenceCount(state.items) + item.weeks > MAX_ORDER_OCCURRENCES
  ) {
    return { ok: false, reason: "full" };
  }
  const conflict = findCartConflict(state.items, item);
  if (conflict)
    return { ok: false, reason: "conflict", conflictDate: conflict.date };
  return { ok: true, state: { ...state, items: [...state.items, item] } };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function readItem(value: unknown): CartItem | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const studioIds = Array.isArray(item.studioIds) ? item.studioIds : [];
  if (
    typeof item.id !== "string" ||
    typeof item.spaceKey !== "string" ||
    typeof item.spaceName !== "string" ||
    (item.audience !== "private" && item.audience !== "group") ||
    typeof item.date !== "string" ||
    !isDateKey(item.date) ||
    typeof item.startTime !== "string" ||
    typeof item.endTime !== "string" ||
    !isTime(item.startTime) ||
    !isTime(item.endTime) ||
    timeToMinutes(item.endTime) <= timeToMinutes(item.startTime) ||
    !isPositiveInteger(item.weeks) ||
    item.weeks > MAX_REPEAT_WEEKS ||
    studioIds.length < 1 ||
    studioIds.length > 2 ||
    !studioIds.every(isPositiveInteger) ||
    typeof item.hourlyRate !== "number" ||
    typeof item.groupHourlyRate !== "number"
  ) {
    return null;
  }
  return {
    id: item.id,
    spaceKey: item.spaceKey,
    studioIds: studioIds as number[],
    spaceName: item.spaceName,
    audience: item.audience,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    weeks: item.weeks,
    hourlyRate: item.hourlyRate,
    groupHourlyRate: item.groupHourlyRate,
  };
}

/** Restores a saved cart, dropping malformed items and series that have started. */
export function restoreCart(raw: unknown, today: string): CartState {
  if (typeof raw !== "object" || raw === null) return EMPTY_CART;
  const value = raw as Record<string, unknown>;
  const items = (Array.isArray(value.items) ? value.items : [])
    .map(readItem)
    .filter((item): item is CartItem => item !== null && item.date >= today);

  const kept: CartItem[] = [];
  for (const item of items) {
    const result = addItem({ items: kept }, item);
    if (result.ok) kept.push(item);
  }
  return { items: kept };
}
