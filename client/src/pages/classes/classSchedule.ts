import {
  addDays,
  CLASS_SCHEDULE_DAYS,
  dayOfWeek,
  timeToMinutes,
  type ClassLevel,
} from "@shared/booking";

export type ScheduledClass = {
  id: number;
  title: string;
  style: string;
  level: ClassLevel;
  instructorName: string | null;
  instructorInstagram: string | null;
  instructorImageUrl: string | null;
  studioName: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  startsOn: string | null;
  endsOn: string | null;
};

export type ClassFilters = {
  /** Empty for every style. */
  style: string;
  /** Empty for every level. */
  level: string;
  /** Free text matched against title, style, teacher, studio and level. */
  search: string;
};

export const NO_FILTERS: ClassFilters = { style: "", level: "", search: "" };

/** Translated level name, so searching "débutant" works in French. */
export type LevelLabel = (level: ClassLevel) => string;

export function hasFilters(filters: ClassFilters): boolean {
  return Boolean(filters.style || filters.level || filters.search.trim());
}

/** Lower case without accents: "Débutant" matches "debutant". */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function runsOn(item: ScheduledClass, date: string): boolean {
  return (
    item.dayOfWeek === dayOfWeek(date) &&
    (!item.startsOn || item.startsOn <= date) &&
    (!item.endsOn || item.endsOn >= date)
  );
}

function matchesFilters(
  item: ScheduledClass,
  filters: ClassFilters,
  levelLabel?: LevelLabel
): boolean {
  if (filters.style && item.style !== filters.style) return false;
  if (filters.level && item.level !== filters.level) return false;
  const terms = normalizeText(filters.search).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeText(
    [
      item.title,
      item.style,
      item.instructorName ?? "",
      item.studioName ?? "",
      levelLabel ? levelLabel(item.level) : item.level,
    ].join(" ")
  );
  return terms.every(term => haystack.includes(term));
}

export function classesOn(
  classes: readonly ScheduledClass[],
  date: string,
  filters: ClassFilters,
  levelLabel?: LevelLabel
): ScheduledClass[] {
  return classes
    .filter(
      item => runsOn(item, date) && matchesFilters(item, filters, levelLabel)
    )
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title)
    );
}

/** Classes that start together, in time order: one row of the timeline each. */
export function groupByStartTime(
  classes: readonly ScheduledClass[]
): { startTime: string; items: ScheduledClass[] }[] {
  const groups: { startTime: string; items: ScheduledClass[] }[] = [];
  for (const item of classes) {
    const last = groups[groups.length - 1];
    if (last && last.startTime === item.startTime) last.items.push(item);
    else groups.push({ startTime: item.startTime, items: [item] });
  }
  return groups;
}

/** The next date after `from` (up to `lastDate`) with a matching class. */
export function nextClassDate(
  classes: readonly ScheduledClass[],
  from: string,
  lastDate: string,
  filters: ClassFilters,
  levelLabel?: LevelLabel
): string | null {
  for (let date = addDays(from, 1); date <= lastDate; date = addDays(date, 1)) {
    if (
      classes.some(
        item => runsOn(item, date) && matchesFilters(item, filters, levelLabel)
      )
    )
      return date;
  }
  return null;
}

/**
 * Dates a class takes place from today on, as far as the schedule goes.
 * Today's class is left out once it has started.
 */
export function upcomingDates(
  item: ScheduledClass,
  now: { dateKey: string; minutes: number },
  days: number = CLASS_SCHEDULE_DAYS
): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(now.dateKey, offset);
    if (!runsOn(item, date)) continue;
    if (offset === 0 && timeToMinutes(item.startTime) <= now.minutes) continue;
    dates.push(date);
  }
  return dates;
}

export function uniqueSorted(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b));
}
