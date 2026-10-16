import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { CLASS_LEVELS, type ClassLevel } from "@shared/booking";
import Dialog from "@/components/Dialog";
import { useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  emptyToNull,
  reportAdminError,
  weekdayName,
  WEEKDAYS_MONDAY_FIRST,
} from "./adminShared";

type ClassForm = {
  id: number | null;
  title: string;
  style: string;
  level: ClassLevel;
  instructorName: string;
  instructorInstagram: string;
  instructorImageUrl: string;
  studioId: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
};

const BLANK: ClassForm = {
  id: null,
  title: "",
  style: "",
  level: "open",
  instructorName: "",
  instructorInstagram: "",
  instructorImageUrl: "",
  studioId: "",
  dayOfWeek: 1,
  startTime: "18:00",
  durationMinutes: "60",
  startsOn: "",
  endsOn: "",
  isActive: true,
};

export default function ClassesPanel({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<ClassForm | null>(null);
  const list = trpc.admin.classes.list.useQuery();
  const studios = trpc.admin.studios.list.useQuery();
  const onError = (error: unknown) =>
    reportAdminError(error, t, onUnauthorized);
  const create = trpc.admin.classes.create.useMutation({ onError });
  const update = trpc.admin.classes.update.useMutation({ onError });
  const remove = trpc.admin.classes.remove.useMutation({ onError });
  const classes = list.data ?? [];
  const styles = Array.from(new Set(classes.map(item => item.style))).sort();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const data = {
      title: form.title,
      style: form.style,
      level: form.level,
      instructorName: emptyToNull(form.instructorName),
      instructorInstagram: emptyToNull(form.instructorInstagram),
      instructorImageUrl: emptyToNull(form.instructorImageUrl),
      studioId: form.studioId ? Number(form.studioId) : null,
      dayOfWeek: form.dayOfWeek,
      startTime: form.startTime,
      durationMinutes: Number(form.durationMinutes),
      startsOn: form.startsOn || null,
      endsOn: form.endsOn || null,
      isActive: form.isActive,
    };
    try {
      if (form.id === null) await create.mutateAsync(data);
      else await update.mutateAsync({ id: form.id, data });
      toast.success(t("admin.saved"));
      setForm(null);
      await utils.admin.classes.list.invalidate();
    } catch {
      // Reported by onError.
    }
  }

  async function removeClass(id: number) {
    if (!window.confirm(t("admin.classes.confirmDelete"))) return;
    await remove.mutateAsync({ id }).catch(() => undefined);
    await utils.admin.classes.list.invalidate();
  }

  return (
    <section className="admin-panel" aria-labelledby="classes-title">
      <div className="admin-panel__header">
        <h1 id="classes-title" className="admin-panel__title">
          {t("admin.tabs.classes")}
        </h1>
        <button
          type="button"
          className="button button--primary button--small"
          onClick={() => setForm(BLANK)}
        >
          <Plus aria-hidden="true" />
          {t("admin.classes.add")}
        </button>
      </div>
      <p className="admin-panel__help">{t("admin.classes.help")}</p>

      {list.isLoading ? (
        <p className="admin-panel__state">{t("common.loading")}</p>
      ) : list.error ? (
        <p className="notice notice--error">{t("errors.loadBody")}</p>
      ) : classes.length === 0 ? (
        <p className="admin-panel__state">{t("admin.classes.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("admin.classes.day")}</th>
                <th>{t("admin.classes.time")}</th>
                <th>{t("admin.classes.class")}</th>
                <th>{t("admin.classes.instructor")}</th>
                <th>{t("admin.classes.studio")}</th>
                <th>{t("admin.classes.dates")}</th>
                <th>
                  <span className="visually-hidden">{t("admin.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {classes.map(item => (
                <tr
                  key={item.id}
                  className={
                    item.isActive ? undefined : "admin-table__row--muted"
                  }
                >
                  <td>{weekdayName(item.dayOfWeek, format.locale)}</td>
                  <td className="tabular">{format.time(item.startTime)}</td>
                  <td>
                    <div>{item.title}</div>
                    <div className="admin-table__sub">
                      {item.style}, {t(`classes.levels.${item.level}`)}
                      {!item.isActive && `, ${t("admin.hidden")}`}
                    </div>
                  </td>
                  <td>{item.instructorName ?? "–"}</td>
                  <td>{item.studioName ?? "–"}</td>
                  <td className="admin-table__sub">
                    {item.startsOn || item.endsOn
                      ? `${item.startsOn ? format.monthDay(item.startsOn) : "…"} – ${item.endsOn ? format.monthDay(item.endsOn) : "…"}`
                      : t("admin.classes.ongoing")}
                  </td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      onClick={() =>
                        setForm({
                          id: item.id,
                          title: item.title,
                          style: item.style,
                          level: item.level,
                          instructorName: item.instructorName ?? "",
                          instructorInstagram: item.instructorInstagram ?? "",
                          instructorImageUrl: item.instructorImageUrl ?? "",
                          studioId: item.studioId ? String(item.studioId) : "",
                          dayOfWeek: item.dayOfWeek,
                          startTime: item.startTime,
                          durationMinutes: String(item.durationMinutes),
                          startsOn: item.startsOn ?? "",
                          endsOn: item.endsOn ?? "",
                          isActive: item.isActive,
                        })
                      }
                    >
                      {t("admin.edit")}
                    </button>
                    <button
                      type="button"
                      className="button button--quiet button--small admin-table__danger"
                      onClick={() => void removeClass(item.id)}
                    >
                      {t("admin.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        title={
          form?.id === null ? t("admin.classes.add") : t("admin.classes.edit")
        }
      >
        {form && (
          <form className="admin-form" onSubmit={save}>
            <label className="field">
              <span className="field__label">{t("admin.classes.title")}</span>
              <input
                className="field__input"
                required
                maxLength={120}
                value={form.title}
                onChange={event =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </label>
            <div className="admin-form__row">
              <label className="field">
                <span className="field__label">{t("admin.classes.style")}</span>
                <input
                  className="field__input"
                  required
                  maxLength={60}
                  list="class-styles"
                  value={form.style}
                  onChange={event =>
                    setForm({ ...form, style: event.target.value })
                  }
                />
                <datalist id="class-styles">
                  {styles.map(style => (
                    <option key={style} value={style} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span className="field__label">{t("admin.classes.level")}</span>
                <select
                  className="field__select"
                  value={form.level}
                  onChange={event =>
                    setForm({
                      ...form,
                      level: event.target.value as ClassLevel,
                    })
                  }
                >
                  {CLASS_LEVELS.map(level => (
                    <option key={level} value={level}>
                      {t(`classes.levels.${level}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-form__row">
              <label className="field">
                <span className="field__label">{t("admin.classes.day")}</span>
                <select
                  className="field__select"
                  value={form.dayOfWeek}
                  onChange={event =>
                    setForm({ ...form, dayOfWeek: Number(event.target.value) })
                  }
                >
                  {WEEKDAYS_MONDAY_FIRST.map(day => (
                    <option key={day} value={day}>
                      {weekdayName(day, format.locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">{t("admin.classes.time")}</span>
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
                <span className="field__label">
                  {t("admin.classes.duration")}
                </span>
                <input
                  className="field__input"
                  type="number"
                  required
                  min={15}
                  max={480}
                  step={5}
                  value={form.durationMinutes}
                  onChange={event =>
                    setForm({ ...form, durationMinutes: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="admin-form__row">
              <label className="field">
                <span className="field__label">
                  {t("admin.classes.instructor")}
                </span>
                <input
                  className="field__input"
                  maxLength={120}
                  value={form.instructorName}
                  onChange={event =>
                    setForm({ ...form, instructorName: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {t("admin.classes.instagram")}
                </span>
                <input
                  className="field__input"
                  maxLength={31}
                  placeholder="@username"
                  value={form.instructorInstagram}
                  onChange={event =>
                    setForm({
                      ...form,
                      instructorInstagram: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label className="field">
              <span className="field__label">{t("admin.classes.photo")}</span>
              <input
                className="field__input"
                type="url"
                placeholder="https://"
                value={form.instructorImageUrl}
                onChange={event =>
                  setForm({ ...form, instructorImageUrl: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field__label">{t("admin.classes.studio")}</span>
              <select
                className="field__select"
                value={form.studioId}
                onChange={event =>
                  setForm({ ...form, studioId: event.target.value })
                }
              >
                <option value="">{t("admin.classes.noStudio")}</option>
                {(studios.data ?? []).map(studio => (
                  <option key={studio.id} value={String(studio.id)}>
                    {studio.name}
                  </option>
                ))}
              </select>
              <span className="field__hint">
                {t("admin.classes.studioHint")}
              </span>
            </label>
            <div className="admin-form__row">
              <label className="field">
                <span className="field__label">
                  {t("admin.classes.startsOn")}
                </span>
                <input
                  className="field__input"
                  type="date"
                  value={form.startsOn}
                  onChange={event =>
                    setForm({ ...form, startsOn: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {t("admin.classes.endsOn")}
                </span>
                <input
                  className="field__input"
                  type="date"
                  value={form.endsOn}
                  min={form.startsOn || undefined}
                  onChange={event =>
                    setForm({ ...form, endsOn: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={event =>
                  setForm({ ...form, isActive: event.target.checked })
                }
              />
              {t("admin.classes.visible")}
            </label>
            <div className="button-row">
              <button
                type="submit"
                className="button button--primary"
                disabled={create.isPending || update.isPending}
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
