import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Instagram } from "lucide-react";
import { addDays, CLASS_LEVELS, studioNow } from "@shared/booking";
import DateStrip from "@/components/DateStrip";
import PageHeader from "@/components/PageHeader";
import { useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/usePageMeta";
import {
  classesOn,
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
    <span className="class-row__avatar" aria-hidden="true">
      {item.instructorImageUrl ? (
        <img src={item.instructorImageUrl} alt="" loading="lazy" />
      ) : (
        initials
      )}
    </span>
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

  const options = useMemo(
    () => ({
      styles: uniqueSorted(classes.map(item => item.style)),
      levels: CLASS_LEVELS.filter(level =>
        classes.some(item => item.level === level)
      ),
      instructors: uniqueSorted(classes.map(item => item.instructorName)),
    }),
    [classes]
  );
  const dayClasses = classesOn(classes, date, filters);
  const nextDate = dayClasses.length
    ? null
    : nextClassDate(classes, date, lastDate, filters);
  const filtersActive = Boolean(
    filters.style || filters.level || filters.instructor
  );

  const updateFilter =
    (key: keyof ClassFilters) =>
    (event: React.ChangeEvent<HTMLSelectElement>) =>
      setFilters(current => ({ ...current, [key]: event.target.value }));

  return (
    <>
      <PageHeader title={t("classes.title")} intro={t("classes.intro")} />

      <section
        className="container class-finder"
        aria-labelledby="class-finder-title"
      >
        <div className="class-finder__toolbar">
          <h2 id="class-finder-title" className="visually-hidden">
            {t("classes.scheduleTitle")}
          </h2>
          <div className="class-filters">
            <label className="field">
              <span className="field__label">{t("classes.filters.style")}</span>
              <select
                className="field__select"
                value={filters.style}
                onChange={updateFilter("style")}
              >
                <option value="">{t("classes.filters.allStyles")}</option>
                {options.styles.map(style => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t("classes.filters.level")}</span>
              <select
                className="field__select"
                value={filters.level}
                onChange={updateFilter("level")}
              >
                <option value="">{t("classes.filters.allLevels")}</option>
                {options.levels.map(level => (
                  <option key={level} value={level}>
                    {t(`classes.levels.${level}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                {t("classes.filters.instructor")}
              </span>
              <select
                className="field__select"
                value={filters.instructor}
                onChange={updateFilter("instructor")}
              >
                <option value="">{t("classes.filters.allInstructors")}</option>
                {options.instructors.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <DateStrip
          selected={date}
          today={today}
          lastDate={lastDate}
          onSelect={setDate}
          label={t("classes.chooseDay")}
        />

        <div className="class-day" aria-live="polite">
          <div className="class-day__heading">
            <h3 className="class-day__date">{format.longDate(date)}</h3>
            <p className="class-day__note">{t("classes.timeZoneNote")}</p>
          </div>

          {query.isLoading ? (
            <div className="class-list" aria-busy="true">
              {[0, 1, 2].map(index => (
                <div key={index} className="skeleton class-row--skeleton" />
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
            <ul className="class-list" role="list">
              {dayClasses.map(item => (
                <li key={item.id} className="class-row">
                  <div className="class-row__time">
                    <span className="class-row__start tabular">
                      {format.time(item.startTime)}
                    </span>
                    <span className="class-row__duration">
                      {format.duration(item.durationMinutes)}
                    </span>
                  </div>
                  <Avatar item={item} />
                  <div className="class-row__details">
                    <h4 className="class-row__title">{item.title}</h4>
                    <p className="class-row__meta">
                      <span className="class-row__level">
                        {t(`classes.levels.${item.level}`)}
                      </span>
                      {item.instructorName &&
                        (item.instructorInstagram ? (
                          <a
                            className="class-row__instructor"
                            href={`https://www.instagram.com/${item.instructorInstagram}/`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Instagram aria-hidden="true" />
                            {item.instructorName}
                          </a>
                        ) : (
                          <span className="class-row__instructor">
                            {item.instructorName}
                          </span>
                        ))}
                    </p>
                    {item.studioName && (
                      <p className="class-row__place">{item.studioName}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button--primary class-row__action"
                    onClick={() => setPassFor(item)}
                    disabled={!passes.length}
                  >
                    {t("classes.buyPass")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <p>
                {filtersActive
                  ? t("classes.emptyFiltered")
                  : t("classes.empty")}
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
                {filtersActive && (
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
