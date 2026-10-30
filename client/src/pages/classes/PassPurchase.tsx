import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TRPCClientError } from "@trpc/client";
import { useTranslation } from "react-i18next";
import { CalendarCheck, Loader2, LockKeyhole } from "lucide-react";
import { addDays, studioNow } from "@shared/booking";
import Dialog from "@/components/Dialog";
import { currentLanguage, useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { upcomingDates, type ScheduledClass } from "./classSchedule";
import { PassList, passName, type Pass } from "./PassShop";

/** What the dialog was opened for: a pass, or a class card (pass not chosen yet). */
export type PurchaseStart = {
  pass: Pass | null;
  forClass: ScheduledClass | null;
  /** The date open on the schedule: a drop-in starts on it when it can. */
  date: string;
};

type Props = {
  start: PurchaseStart | null;
  passes: Pass[];
  classes: ScheduledClass[];
  onClose: () => void;
};

// 2026-10-18 is a Sunday: day 0..6 of the schedule maps onto that week.
const REFERENCE_SUNDAY = "2026-10-18";
// Monday first, as on the schedule.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "miércoles, 4 de noviembre" → "Miércoles, 4 de noviembre" at the start of a line. */
const capitalized = (text: string) =>
  text.charAt(0).toLocaleUpperCase() + text.slice(1);

export default function PassPurchase({
  start,
  passes,
  classes,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const checkout = trpc.passes.checkout.useMutation();

  const [pass, setPass] = useState<Pass | null>(null);
  const [classId, setClassId] = useState("");
  const [classDate, setClassDate] = useState("");
  const [contact, setContact] = useState({ name: "", email: "" });
  const [error, setError] = useState<string | null>(null);

  // A new start resets the choice; contact details stay for the visit.
  useEffect(() => {
    if (!start) return;
    setPass(start.pass);
    setClassId(start.forClass ? String(start.forClass.id) : "");
    setClassDate("");
    setError(null);
  }, [start]);

  // Taken when the dialog opens, so today's class drops out once it starts.
  const now = useMemo(() => studioNow(), [start]);
  const today = now.dateKey;
  const classOptions = useMemo(
    () =>
      classes
        .filter(item => !item.endsOn || item.endsOn >= today)
        .sort(
          (a, b) =>
            WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
            a.startTime.localeCompare(b.startTime) ||
            a.title.localeCompare(b.title)
        )
        .map(item => ({
          value: String(item.id),
          label: `${item.title} (${format.weekdayLong(
            addDays(REFERENCE_SUNDAY, item.dayOfWeek)
          )}, ${format.time(item.startTime)})`,
        })),
    [classes, format, today]
  );

  // Drop-in: the dates the chosen class takes place.
  const chosenClass = classes.find(item => String(item.id) === classId);
  const dateOptions = useMemo(
    () => (chosenClass ? upcomingDates(chosenClass, now) : []),
    [chosenClass, now]
  );
  const needsDate = Boolean(pass?.requiresClass && pass.requiresDate);

  // Start on the date open on the schedule, or the class's next date.
  useEffect(() => {
    setClassDate(current => {
      if (dateOptions.includes(current)) return current;
      if (start && dateOptions.includes(start.date)) return start.date;
      return dateOptions[0] ?? "";
    });
  }, [dateOptions, start]);

  // From a class card, offer the passes that cover classes.
  const choices = start?.forClass
    ? passes.filter(item => item.category === "classes")
    : passes;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pass) return;
    setError(null);
    try {
      const result = await checkout.mutateAsync({
        passId: pass.id,
        classId: pass.requiresClass ? Number(classId) : null,
        classDate: needsDate ? classDate : null,
        customerName: contact.name,
        customerEmail: contact.email,
        locale: currentLanguage(language),
      });
      window.location.assign(result.checkoutUrl);
    } catch (caught) {
      const code =
        caught instanceof TRPCClientError ? caught.data?.code : undefined;
      setError(
        code === "TOO_MANY_REQUESTS"
          ? t("errors.tooMany")
          : code === "NOT_FOUND"
            ? t("classes.purchase.unavailable")
            : t("classes.purchase.failed")
      );
    }
  }

  const busy = checkout.isPending || checkout.isSuccess;

  return (
    <Dialog
      open={start !== null}
      onClose={onClose}
      title={pass ? passName(language, pass) : t("classes.passes.pickTitle")}
      subtitle={
        pass
          ? format.money(pass.priceCents, pass.currency)
          : start?.forClass
            ? `${start.forClass.title}, ${format.time(start.forClass.startTime)}`
            : undefined
      }
    >
      {!pass ? (
        <div className="pass-purchase">
          <PassList passes={choices} onBuy={setPass} compact />
        </div>
      ) : (
        <form className="pass-purchase" onSubmit={submit}>
          <label className="field">
            <span className="field__label">{t("checkout.form.name")}</span>
            <input
              className="field__input"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              value={contact.name}
              onChange={event =>
                setContact(current => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span className="field__label">{t("checkout.form.email")}</span>
            <input
              className="field__input"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={contact.email}
              onChange={event =>
                setContact(current => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </label>
          {pass.requiresClass && (
            <label className="field">
              <span className="field__label">
                {t("classes.purchase.class")}
              </span>
              <select
                className="field__select"
                required
                value={classId}
                onChange={event => setClassId(event.target.value)}
              >
                <option value="" disabled>
                  {t("classes.purchase.chooseClass")}
                </option>
                {classOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {!needsDate && (
                <span className="field__hint">
                  {t("classes.purchase.oneClass")}
                </span>
              )}
            </label>
          )}

          {needsDate && (
            <label className="field">
              <span className="field__label">{t("classes.purchase.date")}</span>
              <select
                className="field__select"
                required
                disabled={!chosenClass || !dateOptions.length}
                value={classDate}
                onChange={event => setClassDate(event.target.value)}
              >
                {!chosenClass ? (
                  <option value="">
                    {t("classes.purchase.chooseClassFirst")}
                  </option>
                ) : !dateOptions.length ? (
                  <option value="">{t("classes.purchase.noDates")}</option>
                ) : (
                  dateOptions.map(date => (
                    <option key={date} value={date}>
                      {capitalized(
                        date === today
                          ? t("classes.purchase.todayDate", {
                              date: format.longDate(date),
                            })
                          : format.longDate(date)
                      )}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

          {needsDate && chosenClass && classDate && (
            <div className="drop-in-summary" aria-live="polite">
              <CalendarCheck aria-hidden="true" />
              <div>
                <p className="drop-in-summary__label">
                  {t("classes.purchase.dropIn.label")}
                </p>
                <p className="drop-in-summary__when">
                  {capitalized(
                    t("classes.purchase.dropIn.when", {
                      date: format.longDate(classDate),
                      time: format.time(chosenClass.startTime),
                    })
                  )}
                </p>
                <p className="drop-in-summary__class">{chosenClass.title}</p>
                <p className="drop-in-summary__note">
                  {t("classes.purchase.dropIn.note")}
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}

          <div className="pass-purchase__actions">
            <button
              type="submit"
              className="button button--primary button--block"
              disabled={busy || (needsDate && !classDate)}
            >
              {busy ? (
                <Loader2 className="spinner" aria-hidden="true" />
              ) : (
                <LockKeyhole aria-hidden="true" />
              )}
              {t("classes.purchase.pay")}
            </button>
            {!start?.pass && (
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setPass(null)}
                disabled={busy}
              >
                {t("classes.purchase.otherPass")}
              </button>
            )}
          </div>
          <p className="pass-purchase__note">{t("classes.purchase.note")}</p>
        </form>
      )}
    </Dialog>
  );
}
