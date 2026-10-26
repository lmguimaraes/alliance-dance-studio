import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Instagram, Search, X } from "lucide-react";
import {
  addDays,
  CLASS_LEVELS,
  minutesToTime,
  studioNow,
  timeToMinutes,
  type ClassLevel,
} from "@shared/booking";
import DateStrip from "@/components/DateStrip";
import PageHeader from "@/components/PageHeader";
import { cx } from "@/lib/cx";
import { useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/usePageMeta";
import {
  classesOn,
  groupByStartTime,
  hasFilters,
  nextClassDate,
  NO_FILTERS,
  uniqueSorted,
  type ClassFilters,
  type ScheduledClass,
} from "./classSchedule";
import PassPicker from "./PassPicker";
import PassShop from "./PassShop";
import "./classes.css";

const SCHEDULE_DAYS = 56;

function Avatar({ item }: { item: ScheduledClass }) {
  const initials = (item.instructorName ?? item.style)
    .replace(/[@_.]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("");
  return (
    <span className="class-card__avatar" aria-hidden="true">
      {item.instructorImageUrl ? (
        <img src={item.instructorImageUrl} alt="" loading="lazy" />
      ) : (
        initials
      )}
    </span>
  );
}

type ChipGroupProps = {
  label: string;
  allLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

/** A row of filter chips; one is pressed at a time, "All" clears it. */
function ChipGroup({
  label,
  allLabel,
  value,
  options,
  onChange,
}: ChipGroupProps) {
  return (
    <div className="filter-chips" role="group" aria-label={label}>
      {[{ value: "", label: allLabel }, ...options].map(option => (
        <button
          key={option.value || "all"}
          type="button"
          className="filter-chip"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function ClassesPage() {
  const { t } = useTranslation();
  const format = useFormat();
  usePageMeta(t("classes.title"), t("classes.intro"));

  const today = useMemo(() => studioNow().dateKey, []);
  const lastDate = addDays(today, SCHEDULE_DAYS - 1);
  const [date, setDate] = useState(today);
  const [filters, setFilters] = useState<ClassFilters>(NO_FILTERS);
  const [passFor, setPassFor] = useState<ScheduledClass | null>(null);

  const query = trpc.site.classes.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const classes = (query.data?.classes ?? []) as ScheduledClass[];
  const passes = query.data?.passes ?? [];

  const levelLabel = useCallback(
    (level: ClassLevel) => t(`classes.levels.${level}`),
    [t]
  );
  // Chips come from the classes that are active in the admin panel.
  const styles = useMemo(
    () => uniqueSorted(classes.map(item => item.style)),
    [classes]
  );
  const levels = useMemo(
    () =>
      CLASS_LEVELS.filter(level => classes.some(item => item.level === level)),
    [classes]
  );

  const dayClasses = classesOn(classes, date, filters, levelLabel);
  const nextDate = dayClasses.length
    ? null
    : nextClassDate(classes, date, lastDate, filters, levelLabel);
  const filtering = hasFilters(filters);
  const setFilter = (key: keyof ClassFilters) => (value: string) =>
    setFilters(current => ({ ...current, [key]: value }));

  return (
    <>
      <PageHeader title={t("classes.title")} intro={t("classes.intro")} />

      <section
        className="container class-finder"
        aria-labelledby="class-finder-title"
      >
        <h2 id="class-finder-title" className="visually-hidden">
          {t("classes.scheduleTitle")}
        </h2>

        <div className="class-finder__filters">
          <div className="class-search">
            <Search className="class-search__icon" aria-hidden="true" />
            <input
              className="class-search__input"
              type="search"
              value={filters.search}
              onChange={event => setFilter("search")(event.target.value)}
              placeholder={t("classes.search.placeholder")}
              aria-label={t("classes.search.label")}
              autoComplete="off"
              enterKeyHint="search"
            />
            {filters.search && (
              <button
                type="button"
                className="class-search__clear"
                onClick={() => setFilter("search")("")}
                aria-label={t("classes.search.clear")}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>
          {styles.length > 1 && (
            <ChipGroup
              label={t("classes.filters.style")}
              allLabel={t("classes.filters.allStyles")}
              value={filters.style}
              options={styles.map(style => ({ value: style, label: style }))}
              onChange={setFilter("style")}
            />
          )}
          {levels.length > 1 && (
            <ChipGroup
              label={t("classes.filters.level")}
              allLabel={t("classes.filters.allLevels")}
              value={filters.level}
              options={levels.map(level => ({
                value: level,
                label: levelLabel(level),
              }))}
              onChange={setFilter("level")}
            />
          )}
        </div>

        <DateStrip
          selected={date}
          today={today}
          lastDate={lastDate}
          onSelect={setDate}
          label={t("classes.chooseDay")}
          variant="tabs"
        />

        <div className="class-day" aria-live="polite">
          <div className="class-day__heading">
            <h3 className="class-day__title">
              {format.weekdayLong(date)}
              <span className="class-day__date">{format.monthDay(date)}</span>
            </h3>
            <p className="class-day__note">{t("classes.timeZoneNote")}</p>
          </div>

          {query.isLoading ? (
            <div className="class-timeline" aria-busy="true">
              {[0, 1, 2].map(index => (
                <div key={index} className="skeleton class-card--skeleton" />
              ))}
            </div>
          ) : query.error ? (
            <div className="notice notice--error" role="alert">
              <strong>{t("errors.loadTitle")}</strong>
              {t("errors.loadBody")}{" "}
              <button
                type="button"
                className="button button--quiet"
                onClick={() => void query.refetch()}
              >
                {t("common.retry")}
              </button>
            </div>
          ) : dayClasses.length ? (
            <ol className="class-timeline" role="list">
              {groupByStartTime(dayClasses).map(group => (
                <li key={group.startTime} className="class-timeline__slot">
                  <p className="class-timeline__time tabular">
                    {format.time(group.startTime)}
                  </p>
                  <ul className="class-timeline__cards" role="list">
                    {group.items.map(item => (
                      <li key={item.id}>
                        <article
                          className="class-card"
                          aria-labelledby={`class-${item.id}`}
                        >
                          <div className="class-card__top">
                            <p className="class-card__when tabular">
                              {format.timeRange(
                                item.startTime,
                                minutesToTime(
                                  timeToMinutes(item.startTime) +
                                    item.durationMinutes
                                )
                              )}
                            </p>
                            <span className="class-card__style">
                              {item.style}
                            </span>
                          </div>
                          <h4
                            id={`class-${item.id}`}
                            className="class-card__title"
                          >
                            {item.title}
                          </h4>
                          {item.instructorName && (
                            <p className="class-card__teacher">
                              <Avatar item={item} />
                              {item.instructorInstagram ? (
                                <a
                                  href={`https://www.instagram.com/${item.instructorInstagram}/`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {item.instructorName}
                                  <Instagram aria-hidden="true" />
                                </a>
                              ) : (
                                <span>{item.instructorName}</span>
                              )}
                            </p>
                          )}
                          <ul className="class-card__tags" role="list">
                            {item.studioName && (
                              <li className="class-tag class-tag--room">
                                {item.studioName}
                              </li>
                            )}
                            <li
                              className={cx(
                                "class-tag",
                                `class-tag--${item.level}`
                              )}
                            >
                              {levelLabel(item.level)}
                            </li>
                          </ul>
                          <button
                            type="button"
                            className="button button--outline button--small class-card__buy"
                            onClick={() => setPassFor(item)}
                            disabled={!passes.length}
                          >
                            {t("classes.buyPass")}
                          </button>
                        </article>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">
              <p>
                {filtering ? t("classes.emptyFiltered") : t("classes.empty")}
              </p>
              <div className="button-row">
                {nextDate && (
                  <button
                    type="button"
                    className="button button--outline"
                    onClick={() => setDate(nextDate)}
                  >
                    {t("classes.nextClass", {
                      date: format.shortDate(nextDate),
                    })}
                  </button>
                )}
                {filtering && (
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => setFilters(NO_FILTERS)}
                  >
                    {t("classes.filters.clear")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <PassShop passes={passes} />
      <PassPicker
        passes={passes}
        forClass={passFor}
        onClose={() => setPassFor(null)}
      />
    </>
  );
}
