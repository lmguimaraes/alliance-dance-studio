import { addDays, dayOfWeek, type ClassLevel } from "@shared/booking";

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
  style: string;
  level: string;
  instructor: string;
};

export const NO_FILTERS: ClassFilters = {
  style: "",
  level: "",
  instructor: "",
};

export function runsOn(item: ScheduledClass, date: string): boolean {
  return (
    item.dayOfWeek === dayOfWeek(date) &&
    (!item.startsOn || item.startsOn <= date) &&
    (!item.endsOn || item.endsOn >= date)
  );
}

export function matchesFilters(
  item: ScheduledClass,
  filters: ClassFilters
): boolean {
  return (
    (!filters.style || item.style === filters.style) &&
    (!filters.level || item.level === filters.level) &&
    (!filters.instructor || item.instructorName === filters.instructor)
  );
}

export function classesOn(
  classes: readonly ScheduledClass[],
  date: string,
  filters: ClassFilters
): ScheduledClass[] {
  return classes
    .filter(item => runsOn(item, date) && matchesFilters(item, filters))
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title)
    );
}

/** The next date after `from` (up to `lastDate`) with a matching class. */
export function nextClassDate(
  classes: readonly ScheduledClass[],
  from: string,
  lastDate: string,
  filters: ClassFilters
): string | null {
  for (let date = addDays(from, 1); date <= lastDate; date = addDays(date, 1)) {
    if (
      classes.some(item => runsOn(item, date) && matchesFilters(item, filters))
    )
      return date;
  }
  return null;
}

export function uniqueSorted(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b));
}
