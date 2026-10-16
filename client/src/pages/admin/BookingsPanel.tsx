import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { studioNow } from "@shared/booking";
import Dialog from "@/components/Dialog";
import { useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  centsToDollars,
  dollarsToCents,
  reportAdminError,
} from "./adminShared";

type Range = "upcoming" | "past" | "all";
type Status = "pending" | "confirmed" | "cancelled";

type Booking = {
  key: string;
  source: "booking" | "legacy";
  id: string;
  studioId: number;
  studioName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: Status;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  notes: string | null;
  totalCents: number | null;
  reservationId: string | null;
  paymentStatus: "paid" | "checkout_pending" | "expired" | "cancelled" | null;
  stripePaymentIntentId: string | null;
};

type FormState = {
  id: number | null;
  stripeLinked: boolean;
  studioKey: string;
  date: string;
  startTime: string;
  endTime: string;
  status: Status;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
  amount: string;
};

const COMBINED_KEY = "combined";

function blankForm(): FormState {
  return {
    id: null,
    stripeLinked: false,
    studioKey: "",
    date: studioNow().dateKey,
    startTime: "10:00",
    endTime: "11:00",
    status: "confirmed",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    notes: "",
    amount: "",
  };
}

export default function BookingsPanel({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const utils = trpc.useUtils();
  const [range, setRange] = useState<Range>("upcoming");
  const [status, setStatus] = useState<Status | "">("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);

  const list = trpc.admin.bookings.list.useQuery({
    range,
    status: status || undefined,
    search: search.trim() || undefined,
  });
  const studios = trpc.admin.studios.list.useQuery();
  const activeStudios = (studios.data ?? []).filter(studio => studio.isActive);
  const studio6 = activeStudios.find(
    studio => studio.name.trim().toLowerCase() === "studio 6"
  );
  const studio7 = activeStudios.find(
    studio => studio.name.trim().toLowerCase() === "studio 7"
  );

  const onError = (error: unknown) =>
    reportAdminError(error, t, onUnauthorized);
  const refresh = () => utils.admin.bookings.list.invalidate();
  const create = trpc.admin.bookings.create.useMutation({ onError });
  const update = trpc.admin.bookings.update.useMutation({ onError });
  const remove = trpc.admin.bookings.remove.useMutation({ onError });
  const cancelLegacy = trpc.admin.bookings.cancelLegacy.useMutation({
    onError,
  });

  const bookings = (list.data ?? []) as Booking[];
  const byDate = useMemo(() => {
    const groups = new Map<string, Booking[]>();
    for (const booking of bookings)
      groups.set(booking.date, [...(groups.get(booking.date) ?? []), booking]);
    return Array.from(groups.entries());
  }, [bookings]);

  function edit(booking: Booking) {
    setForm({
      id: Number(booking.id),
      stripeLinked: Boolean(booking.reservationId),
      studioKey: String(booking.studioId),
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime === "24:00" ? "23:59" : booking.endTime,
      status: booking.status,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone ?? "",
      notes: booking.notes ?? "",
      amount: centsToDollars(booking.totalCents),
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const totalCents = dollarsToCents(form.amount);
    const shared = {
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime === "23:59" ? "24:00" : form.endTime,
      status: form.status,
      customerName: form.customerName,
      customerEmail: form.customerEmail,
      customerPhone: form.customerPhone || null,
      notes: form.notes || null,
      totalCents: totalCents ?? undefined,
    };
    try {
      if (form.id === null) {
        const studioIds =
          form.studioKey === COMBINED_KEY && studio6 && studio7
            ? [studio6.id, studio7.id]
            : [Number(form.studioKey)];
        await create.mutateAsync({ ...shared, studioIds });
        toast.success(t("admin.bookings.created"));
      } else {
        await update.mutateAsync({
          ...shared,
          id: form.id,
          studioId: Number(form.studioKey),
        });
        toast.success(t("admin.saved"));
      }
      setForm(null);
      await refresh();
    } catch {
      // Reported by onError.
    }
  }

  async function removeBooking(booking: Booking) {
    if (booking.source === "legacy") {
      if (!window.confirm(t("admin.bookings.confirmCancel"))) return;
      await cancelLegacy.mutateAsync({ id: booking.id }).catch(() => undefined);
    } else if (booking.reservationId) {
      if (!window.confirm(t("admin.bookings.confirmCancelPaid"))) return;
      await remove
        .mutateAsync({ id: Number(booking.id) })
        .catch(() => undefined);
    } else {
      if (!window.confirm(t("admin.bookings.confirmDelete"))) return;
      await remove
        .mutateAsync({ id: Number(booking.id) })
        .catch(() => undefined);
    }
    await refresh();
  }

  const saving = create.isPending || update.isPending;

  return (
    <section className="admin-panel" aria-labelledby="bookings-title">
      <div className="admin-panel__header">
        <h1 id="bookings-title" className="admin-panel__title">
          {t("admin.tabs.bookings")}
        </h1>
        <button
          type="button"
          className="button button--primary button--small"
          onClick={() => setForm(blankForm())}
        >
          <Plus aria-hidden="true" />
          {t("admin.bookings.add")}
        </button>
      </div>

      <div className="admin-toolbar">
        <div
          className="segmented"
          role="radiogroup"
          aria-label={t("admin.bookings.range")}
        >
          {(["upcoming", "past", "all"] as Range[]).map(option => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={range === option}
              className="segmented__option"
              onClick={() => setRange(option)}
            >
              {t(`admin.bookings.ranges.${option}`)}
            </button>
          ))}
        </div>
        <select
          className="field__select admin-toolbar__select"
          value={status}
          aria-label={t("admin.bookings.status")}
          onChange={event => setStatus(event.target.value as Status | "")}
        >
          <option value="">{t("admin.bookings.allStatuses")}</option>
          {(["confirmed", "pending", "cancelled"] as Status[]).map(option => (
            <option key={option} value={option}>
              {t(`admin.bookings.statuses.${option}`)}
            </option>
          ))}
        </select>
        <input
          className="field__input admin-toolbar__search"
          type="search"
          placeholder={t("admin.bookings.search")}
          aria-label={t("admin.bookings.search")}
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </div>

      {list.isLoading ? (
        <p className="admin-panel__state">{t("common.loading")}</p>
      ) : list.error ? (
        <p className="notice notice--error">{t("errors.loadBody")}</p>
      ) : bookings.length === 0 ? (
        <p className="admin-panel__state">{t("admin.bookings.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("admin.bookings.time")}</th>
                <th>{t("admin.bookings.studio")}</th>
                <th>{t("admin.bookings.customer")}</th>
                <th>{t("admin.bookings.status")}</th>
                <th>{t("admin.bookings.payment")}</th>
                <th className="admin-table__number">
                  {t("admin.bookings.amount")}
                </th>
                <th>
                  <span className="visually-hidden">{t("admin.actions")}</span>
                </th>
              </tr>
            </thead>
            {byDate.map(([date, rows]) => (
              <tbody key={date}>
                <tr className="admin-table__group">
                  <th colSpan={7} scope="rowgroup">
                    {format.fullDate(date)}
                  </th>
                </tr>
                {rows.map(booking => (
                  <tr
                    key={booking.key}
                    className={
                      booking.status === "cancelled"
                        ? "admin-table__row--muted"
                        : undefined
                    }
                  >
                    <td className="tabular">
                      {format.timeRange(booking.startTime, booking.endTime)}
                    </td>
                    <td>{booking.studioName}</td>
                    <td>
                      <div>{booking.customerName}</div>
                      <div className="admin-table__sub">
                        {[booking.customerEmail, booking.customerPhone]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                      {booking.notes && (
                        <div className="admin-table__sub">{booking.notes}</div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`status-tag status-tag--${booking.status}`}
                      >
                        {t(`admin.bookings.statuses.${booking.status}`)}
                      </span>
                    </td>
                    <td className="admin-table__sub">
                      {booking.source === "legacy"
                        ? t("admin.bookings.sources.legacy")
                        : booking.reservationId
                          ? t(
                              `admin.bookings.payments.${booking.paymentStatus ?? "checkout_pending"}`
                            )
                          : t("admin.bookings.sources.staff")}
                    </td>
                    <td className="admin-table__number tabular">
                      {booking.totalCents != null
                        ? format.money(booking.totalCents)
                        : "–"}
                    </td>
                    <td className="admin-table__actions">
                      {booking.source === "booking" && (
                        <button
                          type="button"
                          className="button button--quiet button--small"
                          onClick={() => edit(booking)}
                        >
                          {t("admin.edit")}
                        </button>
                      )}
                      {booking.status !== "cancelled" ||
                      (booking.source === "booking" &&
                        !booking.reservationId) ? (
                        <button
                          type="button"
                          className="button button--quiet button--small admin-table__danger"
                          onClick={() => void removeBooking(booking)}
                        >
                          {booking.source === "booking" &&
                          !booking.reservationId
                            ? t("admin.delete")
                            : t("admin.bookings.cancel")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        title={
          form?.id === null ? t("admin.bookings.add") : t("admin.bookings.edit")
        }
      >
        {form && (
          <form className="admin-form" onSubmit={save}>
            {form.stripeLinked && (
              <p className="notice">{t("admin.bookings.paidOnline")}</p>
            )}
            <label className="field">
              <span className="field__label">{t("admin.bookings.studio")}</span>
              <select
                className="field__select"
                required
                value={form.studioKey}
                onChange={event =>
                  setForm({ ...form, studioKey: event.target.value })
                }
              >
                <option value="" disabled>
                  {t("admin.choose")}
                </option>
                {activeStudios.map(studio => (
                  <option key={studio.id} value={String(studio.id)}>
                    {studio.name}
                  </option>
                ))}
                {form.id === null && studio6 && studio7 && (
                  <option value={COMBINED_KEY}>
                    {t("admin.bookings.combined")}
                  </option>
                )}
              </select>
            </label>
            <div className="admin-form__row">
              <label className="field">
                <span className="field__label">{t("admin.bookings.date")}</span>
                <input
                  className="field__input"
                  type="date"
                  required
                  value={form.date}
                  onChange={event =>
                    setForm({ ...form, date: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {t("admin.bookings.start")}
                </span>
                <input
                  className="field__input"
                  type="time"
                  required
                  step={300}
                  value={form.startTime}
                  onChange={event =>
                    setForm({ ...form, startTime: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">{t("admin.bookings.end")}</span>
                <input
                  className="field__input"
                  type="time"
                  required
                  step={300}
                  value={form.endTime}
                  onChange={event =>
                    setForm({ ...form, endTime: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="field">
              <span className="field__label">{t("admin.bookings.status")}</span>
              <select
                className="field__select"
                value={form.status}
                onChange={event =>
                  setForm({ ...form, status: event.target.value as Status })
                }
              >
                {(["confirmed", "pending", "cancelled"] as Status[]).map(
                  option => (
                    <option key={option} value={option}>
                      {t(`admin.bookings.statuses.${option}`)}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t("checkout.form.name")}</span>
              <input
                className="field__input"
                required
                maxLength={120}
                value={form.customerName}
                onChange={event =>
                  setForm({ ...form, customerName: event.target.value })
                }
              />
            </label>
            <div className="admin-form__row">
              <label className="field">
                <span className="field__label">
                  {t("checkout.form.email")}{" "}
                  <span className="field__optional">
                    {t("common.optional")}
                  </span>
                </span>
                <input
                  className="field__input"
                  type="email"
                  maxLength={254}
                  value={form.customerEmail}
                  onChange={event =>
                    setForm({ ...form, customerEmail: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {t("checkout.form.phone")}{" "}
                  <span className="field__optional">
                    {t("common.optional")}
                  </span>
                </span>
                <input
                  className="field__input"
                  type="tel"
                  maxLength={40}
                  value={form.customerPhone}
                  onChange={event =>
                    setForm({ ...form, customerPhone: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="field">
              <span className="field__label">
                {t("checkout.form.notes")}{" "}
                <span className="field__optional">{t("common.optional")}</span>
              </span>
              <textarea
                className="field__textarea"
                maxLength={1000}
                value={form.notes}
                onChange={event =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field__label">
                {t("admin.bookings.amountDollars")}
              </span>
              <input
                className="field__input"
                inputMode="decimal"
                disabled={form.stripeLinked}
                placeholder={
                  form.id === null
                    ? t("admin.bookings.amountDefault")
                    : undefined
                }
                value={form.amount}
                onChange={event =>
                  setForm({ ...form, amount: event.target.value })
                }
              />
            </label>
            <div className="button-row">
              <button
                type="submit"
                className="button button--primary"
                disabled={saving}
              >
                {t("admin.save")}
              </button>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setForm(null)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
