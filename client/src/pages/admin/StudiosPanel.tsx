import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  centsToDollars,
  dollarsToCents,
  emptyToNull,
  reportAdminError,
  weekdayName,
  WEEKDAYS_MONDAY_FIRST,
} from "./adminShared";

type Hours = { dayOfWeek: number; startTime: string; endTime: string };

type StudioForm = {
  capacity: string;
  size: string;
  hourlyRate: string;
  groupHourlyRate: string;
  imageUrl: string;
  isActive: boolean;
  hours: Hours[];
};

type AdminStudio = {
  id: number;
  name: string;
  capacity: number | null;
  size: string | null;
  hourlyRate: number;
  groupHourlyRate: number;
  imageUrl: string | null;
  isActive: boolean;
  hours: Hours[];
};

function toForm(studio: AdminStudio): StudioForm {
  return {
    capacity: studio.capacity ? String(studio.capacity) : "",
    size: studio.size ?? "",
    hourlyRate: centsToDollars(studio.hourlyRate),
    groupHourlyRate: centsToDollars(studio.groupHourlyRate),
    imageUrl: studio.imageUrl ?? "",
    isActive: studio.isActive,
    hours: studio.hours.map(window => ({
      ...window,
      endTime: window.endTime === "24:00" ? "23:59" : window.endTime,
    })),
  };
}

function StudioEditor({
  studio,
  onUnauthorized,
}: {
  studio: AdminStudio;
  onUnauthorized: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<StudioForm>(() => toForm(studio));
  const update = trpc.admin.studios.update.useMutation({
    onError: error => reportAdminError(error, t, onUnauthorized),
  });

  useEffect(() => setForm(toForm(studio)), [studio]);

  const setHours = (index: number, patch: Partial<Hours>) =>
    setForm(current => ({
      ...current,
      hours: current.hours.map((window, position) =>
        position === index ? { ...window, ...patch } : window
      ),
    }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hourlyRate = dollarsToCents(form.hourlyRate);
    const groupHourlyRate = dollarsToCents(form.groupHourlyRate);
    if (hourlyRate === null || groupHourlyRate === null) {
      toast.error(t("admin.errors.invalid"));
      return;
    }
    try {
      await update.mutateAsync({
        id: studio.id,
        data: {
          capacity: form.capacity ? Number(form.capacity) : null,
          size: emptyToNull(form.size),
          hourlyRate,
          groupHourlyRate,
          imageUrl: emptyToNull(form.imageUrl),
          isActive: form.isActive,
          hours: form.hours.map(window => ({
            ...window,
            endTime: window.endTime === "23:59" ? "24:00" : window.endTime,
          })),
        },
      });
      toast.success(t("admin.saved"));
      await utils.admin.studios.list.invalidate();
    } catch {
      // Reported by onError.
    }
  }

  const sortedHours = form.hours
    .map((window, index) => ({ window, index }))
    .sort(
      (a, b) =>
        WEEKDAYS_MONDAY_FIRST.indexOf(
          a.window.dayOfWeek as (typeof WEEKDAYS_MONDAY_FIRST)[number]
        ) -
          WEEKDAYS_MONDAY_FIRST.indexOf(
            b.window.dayOfWeek as (typeof WEEKDAYS_MONDAY_FIRST)[number]
          ) || a.window.startTime.localeCompare(b.window.startTime)
    );

  return (
    <form
      className="admin-card admin-form"
      onSubmit={save}
      aria-label={studio.name}
    >
      <h2 className="admin-card__title">{studio.name}</h2>
      <div className="admin-form__row">
        <label className="field">
          <span className="field__label">{t("admin.studios.privateRate")}</span>
          <input
            className="field__input"
            inputMode="decimal"
            required
            value={form.hourlyRate}
            onChange={event =>
              setForm({ ...form, hourlyRate: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span className="field__label">{t("admin.studios.groupRate")}</span>
          <input
            className="field__input"
            inputMode="decimal"
            required
            value={form.groupHourlyRate}
            onChange={event =>
              setForm({ ...form, groupHourlyRate: event.target.value })
            }
          />
        </label>
      </div>
      <div className="admin-form__row">
        <label className="field">
          <span className="field__label">{t("admin.studios.capacity")}</span>
          <input
            className="field__input"
            type="number"
            min={1}
            max={1000}
            value={form.capacity}
            onChange={event =>
              setForm({ ...form, capacity: event.target.value })
            }
          />
        </label>
        <label className="field">
          <span className="field__label">{t("admin.studios.size")}</span>
          <input
            className="field__input"
            maxLength={60}
            value={form.size}
            onChange={event => setForm({ ...form, size: event.target.value })}
          />
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t("admin.studios.image")}</span>
        <input
          className="field__input"
          type="url"
          placeholder="https://"
          value={form.imageUrl}
          onChange={event => setForm({ ...form, imageUrl: event.target.value })}
        />
      </label>

      <fieldset className="admin-form__group">
        <legend>{t("admin.studios.hours")}</legend>
        {sortedHours.length === 0 && (
          <p className="field__hint">{t("admin.studios.noHours")}</p>
        )}
        {sortedHours.map(({ window, index }) => (
          <div key={index} className="hours-row">
            <select
              className="field__select"
              aria-label={t("admin.classes.day")}
              value={window.dayOfWeek}
              onChange={event =>
                setHours(index, { dayOfWeek: Number(event.target.value) })
              }
            >
              {WEEKDAYS_MONDAY_FIRST.map(day => (
                <option key={day} value={day}>
                  {weekdayName(day, format.locale)}
                </option>
              ))}
            </select>
            <div className="hours-row__times">
              <input
                className="field__input"
                type="time"
                step={1800}
                aria-label={t("admin.studios.opens")}
                value={window.startTime}
                onChange={event =>
                  setHours(index, { startTime: event.target.value })
                }
              />
              <input
                className="field__input"
                type="time"
                step={1800}
                aria-label={t("admin.studios.closes")}
                value={window.endTime}
                onChange={event =>
                  setHours(index, { endTime: event.target.value })
                }
              />
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={t("admin.delete")}
              onClick={() =>
                setForm(current => ({
                  ...current,
                  hours: current.hours.filter(
                    (_, position) => position !== index
                  ),
                }))
              }
            >
              <X aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() =>
            setForm(current => ({
              ...current,
              hours: [
                ...current.hours,
                { dayOfWeek: 1, startTime: "09:00", endTime: "22:00" },
              ],
            }))
          }
        >
          <Plus aria-hidden="true" />
          {t("admin.studios.addHours")}
        </button>
      </fieldset>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={event =>
            setForm({ ...form, isActive: event.target.checked })
          }
        />
        {t("admin.studios.active")}
      </label>
      <div className="button-row">
        <button
          type="submit"
          className="button button--primary"
          disabled={update.isPending}
        >
          {t("admin.save")}
        </button>
      </div>
    </form>
  );
}

export default function StudiosPanel({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const { t } = useTranslation();
  const list = trpc.admin.studios.list.useQuery();

  return (
    <section className="admin-panel" aria-labelledby="studios-title">
      <div className="admin-panel__header">
        <h1 id="studios-title" className="admin-panel__title">
          {t("admin.tabs.studios")}
        </h1>
      </div>
      <p className="admin-panel__help">{t("admin.studios.help")}</p>
      {list.isLoading ? (
        <p className="admin-panel__state">{t("common.loading")}</p>
      ) : list.error ? (
        <p className="notice notice--error">{t("errors.loadBody")}</p>
      ) : (
        <div className="admin-cards">
          {(list.data ?? []).map(studio => (
            <StudioEditor
              key={studio.id}
              studio={studio}
              onUnauthorized={onUnauthorized}
            />
          ))}
        </div>
      )}
    </section>
  );
}
