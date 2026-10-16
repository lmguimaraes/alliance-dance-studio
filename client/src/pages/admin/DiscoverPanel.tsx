import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import Dialog from "@/components/Dialog";
import { cx } from "@/lib/cx";
import { trpc } from "@/lib/trpc";
import { emptyToNull, reportAdminError } from "./adminShared";

const SECTIONS = ["directors", "dancers", "teams", "awards"] as const;
type Section = (typeof SECTIONS)[number];

type EntryForm = {
  id: number | null;
  section: Section;
  name: string;
  subtitleEn: string;
  subtitleFr: string;
  subtitleEs: string;
  bodyEn: string;
  bodyFr: string;
  bodyEs: string;
  imageUrl: string;
  linkUrl: string;
  year: string;
  sortOrder: string;
  isPublished: boolean;
};

function blank(section: Section): EntryForm {
  return {
    id: null,
    section,
    name: "",
    subtitleEn: "",
    subtitleFr: "",
    subtitleEs: "",
    bodyEn: "",
    bodyFr: "",
    bodyEs: "",
    imageUrl: "",
    linkUrl: "",
    year: "",
    sortOrder: "0",
    isPublished: true,
  };
}

const LANGS = [
  ["En", "English"],
  ["Fr", "Français"],
  ["Es", "Español"],
] as const;

export default function DiscoverPanel({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [section, setSection] = useState<Section>("directors");
  const [form, setForm] = useState<EntryForm | null>(null);
  const list = trpc.admin.discover.list.useQuery();
  const onError = (error: unknown) =>
    reportAdminError(error, t, onUnauthorized);
  const create = trpc.admin.discover.create.useMutation({ onError });
  const update = trpc.admin.discover.update.useMutation({ onError });
  const remove = trpc.admin.discover.remove.useMutation({ onError });
  const entries = (list.data ?? []).filter(entry => entry.section === section);
  const isAward = (form?.section ?? section) === "awards";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const data = {
      section: form.section,
      name: form.name,
      subtitleEn: emptyToNull(form.subtitleEn),
      subtitleFr: emptyToNull(form.subtitleFr),
      subtitleEs: emptyToNull(form.subtitleEs),
      bodyEn: emptyToNull(form.bodyEn),
      bodyFr: emptyToNull(form.bodyFr),
      bodyEs: emptyToNull(form.bodyEs),
      imageUrl: emptyToNull(form.imageUrl),
      linkUrl: emptyToNull(form.linkUrl),
      year: form.year ? Number(form.year) : null,
      sortOrder: Number(form.sortOrder) || 0,
      isPublished: form.isPublished,
    };
    try {
      if (form.id === null) await create.mutateAsync(data);
      else await update.mutateAsync({ id: form.id, data });
      toast.success(t("admin.saved"));
      setForm(null);
      await utils.admin.discover.list.invalidate();
    } catch {
      // Reported by onError.
    }
  }

  async function removeEntry(id: number) {
    if (!window.confirm(t("admin.discover.confirmDelete"))) return;
    await remove.mutateAsync({ id }).catch(() => undefined);
    await utils.admin.discover.list.invalidate();
  }

  return (
    <section className="admin-panel" aria-labelledby="discover-title">
      <div className="admin-panel__header">
        <h1 id="discover-title" className="admin-panel__title">
          {t("admin.tabs.discover")}
        </h1>
        <button
          type="button"
          className="button button--primary button--small"
          onClick={() => setForm(blank(section))}
        >
          <Plus aria-hidden="true" />
          {t("admin.discover.add")}
        </button>
      </div>
      <p className="admin-panel__help">{t("admin.discover.help")}</p>

      <div className="admin-subtabs" role="tablist">
        {SECTIONS.map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === section}
            className={cx(
              "admin-subtabs__tab",
              item === section && "admin-subtabs__tab--active"
            )}
            onClick={() => setSection(item)}
          >
            {t(`discover.sections.${item}.label`)}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <p className="admin-panel__state">{t("common.loading")}</p>
      ) : entries.length === 0 ? (
        <p className="admin-panel__state">{t("admin.discover.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  {section === "awards"
                    ? t("admin.discover.award")
                    : t("admin.discover.name")}
                </th>
                <th>
                  {section === "awards"
                    ? t("admin.discover.result")
                    : t("admin.discover.role")}
                </th>
                {section === "awards" && <th>{t("admin.discover.year")}</th>}
                <th>{t("admin.passes.order")}</th>
                <th>
                  <span className="visually-hidden">{t("admin.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr
                  key={entry.id}
                  className={
                    entry.isPublished ? undefined : "admin-table__row--muted"
                  }
                >
                  <td>
                    {entry.name}
                    {!entry.isPublished && (
                      <div className="admin-table__sub">
                        {t("admin.hidden")}
                      </div>
                    )}
                  </td>
                  <td>{entry.subtitleEn ?? "–"}</td>
                  {section === "awards" && (
                    <td className="tabular">{entry.year ?? "–"}</td>
                  )}
                  <td className="tabular">{entry.sortOrder}</td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      onClick={() =>
                        setForm({
                          id: entry.id,
                          section: entry.section,
                          name: entry.name,
                          subtitleEn: entry.subtitleEn ?? "",
                          subtitleFr: entry.subtitleFr ?? "",
                          subtitleEs: entry.subtitleEs ?? "",
                          bodyEn: entry.bodyEn ?? "",
                          bodyFr: entry.bodyFr ?? "",
                          bodyEs: entry.bodyEs ?? "",
                          imageUrl: entry.imageUrl ?? "",
                          linkUrl: entry.linkUrl ?? "",
                          year: entry.year ? String(entry.year) : "",
                          sortOrder: String(entry.sortOrder),
                          isPublished: entry.isPublished,
                        })
                      }
                    >
                      {t("admin.edit")}
                    </button>
                    <button
                      type="button"
                      className="button button--quiet button--small admin-table__danger"
                      onClick={() => void removeEntry(entry.id)}
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
          form?.id === null ? t("admin.discover.add") : t("admin.discover.edit")
        }
      >
        {form && (
          <form className="admin-form" onSubmit={save}>
            <label className="field">
              <span className="field__label">
                {t("admin.discover.section")}
              </span>
              <select
                className="field__select"
                value={form.section}
                onChange={event =>
                  setForm({ ...form, section: event.target.value as Section })
                }
              >
                {SECTIONS.map(item => (
                  <option key={item} value={item}>
                    {t(`discover.sections.${item}.label`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                {isAward ? t("admin.discover.award") : t("admin.discover.name")}
              </span>
              <input
                className="field__input"
                required
                maxLength={160}
                value={form.name}
                onChange={event =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            {isAward && (
              <label className="field">
                <span className="field__label">{t("admin.discover.year")}</span>
                <input
                  className="field__input"
                  type="number"
                  min={1900}
                  max={2100}
                  value={form.year}
                  onChange={event =>
                    setForm({ ...form, year: event.target.value })
                  }
                />
              </label>
            )}
            {LANGS.map(([suffix, language]) => (
              <fieldset key={suffix} className="admin-form__group">
                <legend>{language}</legend>
                <label className="field">
                  <span className="field__label">
                    {isAward
                      ? t("admin.discover.result")
                      : t("admin.discover.role")}
                  </span>
                  <input
                    className="field__input"
                    maxLength={160}
                    value={form[`subtitle${suffix}`]}
                    onChange={event =>
                      setForm({
                        ...form,
                        [`subtitle${suffix}`]: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field__label">
                    {isAward
                      ? t("admin.discover.details")
                      : t("admin.discover.bio")}
                  </span>
                  <textarea
                    className="field__textarea"
                    maxLength={4000}
                    value={form[`body${suffix}`]}
                    onChange={event =>
                      setForm({
                        ...form,
                        [`body${suffix}`]: event.target.value,
                      })
                    }
                  />
                </label>
              </fieldset>
            ))}
            {!isAward && (
              <label className="field">
                <span className="field__label">
                  {t("admin.discover.image")}
                </span>
                <input
                  className="field__input"
                  type="url"
                  placeholder="https://"
                  value={form.imageUrl}
                  onChange={event =>
                    setForm({ ...form, imageUrl: event.target.value })
                  }
                />
              </label>
            )}
            <label className="field">
              <span className="field__label">{t("admin.discover.link")}</span>
              <input
                className="field__input"
                type="url"
                placeholder="https://www.instagram.com/…"
                value={form.linkUrl}
                onChange={event =>
                  setForm({ ...form, linkUrl: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field__label">{t("admin.passes.order")}</span>
              <input
                className="field__input"
                type="number"
                step={1}
                value={form.sortOrder}
                onChange={event =>
                  setForm({ ...form, sortOrder: event.target.value })
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={event =>
                  setForm({ ...form, isPublished: event.target.checked })
                }
              />
              {t("admin.discover.published")}
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
