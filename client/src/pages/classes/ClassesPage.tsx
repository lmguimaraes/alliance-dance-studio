import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Instagram, Loader2, Search, X } from "lucide-react";
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
import { BRAND } from "@/lib/brand";
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
import PassPurchase, { type PurchaseStart } from "./PassPurchase";
import PassShop from "./PassShop";
import "./classes.css";

const SCHEDULE_DAYS = 56;

type PassSummary = {
  status: "checkout_pending" | "paid" | "expired" | "cancelled";
  passName: string;
  classLabel: string | null;
  customerEmail: string;
};

type PassReturn =
  | { kind: "confirming" }
  | { kind: "done"; summary: PassSummary }
  | { kind: "failed" }
  | { kind: "cancelled" };

/** Message shown after coming back from the Stripe page. */
function PassResult({
  result,
  onClose,
}: {
  result: PassReturn;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const summary = result.kind === "done" ? result.summary : null;
  const outcome =
    result.kind === "done"
      ? summary?.status === "paid"
        ? "paid"
        : summary?.status === "checkout_pending"
          ? "processing"
          : "cancelled"
      : result.kind;

  return (
    <div
      className={cx(
        "notice pass-result",
        outcome === "paid" && "notice--success",
        outcome === "failed" && "notice--error"
      )}
      role={outcome === "failed" ? "alert" : "status"}
    >
      {outcome === "confirming" ? (
        <p className="pass-result__confirming">
          <Loader2 className="spinner" aria-hidden="true" />
          {t("classes.purchase.result.confirming")}
        </p>
      ) : (
        <>
          <strong>{t(`classes.purchase.result.${outcome}.title`)}</strong>
          {outcome === "paid" && summary ? (
            <>
              {t("classes.purchase.result.paid.body", {
                pass: summary.passName,
                email: summary.customerEmail,
              })}
              {summary.classLabel && (
                <span className="pass-result__class">
                  {t("classes.purchase.result.paid.class", {
                    name: summary.classLabel,
                  })}
                </span>
              )}
            </>
          ) : (
            t(`classes.purchase.result.${outcome}.body`, {
              email: BRAND.email,
            })
          )}
          <button
            type="button"
            className="icon-button pass-result__close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

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

type Chip = { kind: "style" | "level"; value: string; label: string };

/**
 * One row of chips with one choice: a class type or a level. Picking one
 * replaces the other; "All classes" clears it.
 */
function FilterChips({
  label,
  allLabel,
  chips,
  filters,
  onSelect,
}: {
  label: string;
  allLabel: string;
  chips: Chip[];
  filters: ClassFilters;
  onSelect: (chip: Chip | null) => void;
}) {
  return (
    <div className="filter-chips" role="group" aria-label={label}>
      <button
        type="button"
        className="filter-chip"
        aria-pressed={!filters.style && !filters.level}
        onClick={() => onSelect(null)}
      >
        {allLabel}
      </button>
      {chips.map((chip, index) => (
        <Fragment key={`${chip.kind}-${chip.value}`}>
          {index > 0 && chip.kind !== chips[index - 1].kind && (
            <span className="filter-chips__divider" aria-hidden="true" />
          )}
          <button
            type="button"
            className="filter-chip"
            aria-pressed={filters[chip.kind] === chip.value}
            onClick={() => onSelect(chip)}
          >
            {chip.label}
          </button>
        </Fragment>
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
  const [purchase, setPurchase] = useState<PurchaseStart | null>(null);
  const [passReturn, setPassReturn] = useState<PassReturn | null>(null);
  const confirmPass = trpc.passes.confirm.useMutation();

  // Coming back from Stripe: /classes?pass=success&session_id=… or ?pass=cancelled
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("pass");
    if (!outcome) return;
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname
    );
    const sessionId = params.get("session_id");
    if (outcome === "success" && sessionId) {
      setPassReturn({ kind: "confirming" });
      confirmPass
        .mutateAsync({ sessionId })
        .then(summary => setPassReturn({ kind: "done", summary }))
        .catch(() => setPassReturn({ kind: "failed" }));
    } else {
      setPassReturn({ kind: "cancelled" });
    }
  }, [confirmPass]);

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

  // Types first, then levels; a group with a single value is left out.
  const chips: Chip[] = [
    ...(styles.length > 1
      ? styles.map(style => ({
          kind: "style" as const,
          value: style,
          label: style,
        }))
      : []),
    ...(levels.length > 1
      ? levels.map(level => ({
          kind: "level" as const,
          value: level,
          label: levelLabel(level),
        }))
      : []),
  ];

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

      {passReturn && (
        <div className="container">
          <PassResult result={passReturn} onClose={() => setPassReturn(null)} />
        </div>
      )}

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
          {chips.length > 0 && (
            <FilterChips
              label={t("classes.filters.label")}
              allLabel={t("classes.filters.all")}
              chips={chips}
              filters={filters}
              onSelect={chip =>
                setFilters(current => ({
                  ...current,
                  style: chip?.kind === "style" ? chip.value : "",
                  level: chip?.kind === "level" ? chip.value : "",
                }))
              }
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
                            onClick={() =>
                              setPurchase({ pass: null, forClass: item })
                            }
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

      <PassShop
        passes={passes}
        onBuy={pass => setPurchase({ pass, forClass: null })}
      />
      <PassPurchase
        start={purchase}
        passes={passes}
        classes={classes}
        onClose={() => setPurchase(null)}
      />
    </>
  );
}
