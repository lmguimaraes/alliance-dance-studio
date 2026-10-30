import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import Dialog from "@/components/Dialog";
import { useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  centsToDollars,
  dollarsToCents,
  emptyToNull,
  reportAdminError,
} from "./adminShared";

type Category = "classes" | "rehearsal";

type PassForm = {
  id: number | null;
  category: Category;
  nameEn: string;
  nameFr: string;
  nameEs: string;
  detailsEn: string;
  detailsFr: string;
  detailsEs: string;
  price: string;
  currency: string;
  requiresClass: boolean;
  requiresDate: boolean;
  sortOrder: string;
  isActive: boolean;
};

const BLANK: PassForm = {
  id: null,
  category: "classes",
  nameEn: "",
  nameFr: "",
  nameEs: "",
  detailsEn: "",
  detailsFr: "",
  detailsEs: "",
  price: "",
  currency: "cad",
  requiresClass: true,
  requiresDate: false,
  sortOrder: "0",
  isActive: true,
};

const LANGS = [
  ["En", "English"],
  ["Fr", "Français"],
  ["Es", "Español"],
] as const;

export default function PassesPanel({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<PassForm | null>(null);
  const list = trpc.admin.passes.list.useQuery();
  const onError = (error: unknown) =>
    reportAdminError(error, t, onUnauthorized);
  const create = trpc.admin.passes.create.useMutation({ onError });
  const update = trpc.admin.passes.update.useMutation({ onError });
  const remove = trpc.admin.passes.remove.useMutation({ onError });
  const passes = list.data ?? [];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const priceCents = dollarsToCents(form.price);
    if (priceCents === null || priceCents <= 0) {
      toast.error(t("admin.errors.invalid"));
      return;
    }
    const data = {
      category: form.category,
      nameEn: form.nameEn,
      nameFr: emptyToNull(form.nameFr),
      nameEs: emptyToNull(form.nameEs),
      detailsEn: emptyToNull(form.detailsEn),
      detailsFr: emptyToNull(form.detailsFr),
      detailsEs: emptyToNull(form.detailsEs),
      priceCents,
      currency: form.currency || "cad",
      requiresClass: form.requiresClass,
      requiresDate: form.requiresClass && form.requiresDate,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
    try {
      if (form.id === null) await create.mutateAsync(data);
      else await update.mutateAsync({ id: form.id, data });
      toast.success(t("admin.saved"));
      setForm(null);
      await utils.admin.passes.list.invalidate();
    } catch {
      // Reported by onError.
    }
  }

  async function removePass(id: number) {
    if (!window.confirm(t("admin.passes.confirmDelete"))) return;
    await remove.mutateAsync({ id }).catch(() => undefined);
    await utils.admin.passes.list.invalidate();
  }

  return (
    <section className="admin-panel" aria-labelledby="passes-title">
      <div className="admin-panel__header">
        <h1 id="passes-title" className="admin-panel__title">
          {t("admin.tabs.passes")}
        </h1>
        <button
          type="button"
          className="button button--primary button--small"
          onClick={() => setForm(BLANK)}
        >
          <Plus aria-hidden="true" />
          {t("admin.passes.add")}
        </button>
      </div>
      <p className="admin-panel__help">{t("admin.passes.help")}</p>

      {list.isLoading ? (
        <p className="admin-panel__state">{t("common.loading")}</p>
      ) : list.error ? (
        <p className="notice notice--error">{t("errors.loadBody")}</p>
      ) : passes.length === 0 ? (
        <p className="admin-panel__state">{t("admin.passes.empty")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("admin.passes.name")}</th>
                <th>{t("admin.passes.category")}</th>
                <th className="admin-table__number">
                  {t("admin.passes.price")}
                </th>
                <th>{t("admin.passes.order")}</th>
                <th>
                  <span className="visually-hidden">{t("admin.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {passes.map(pass => (
                <tr
                  key={pass.id}
                  className={
                    pass.isActive ? undefined : "admin-table__row--muted"
                  }
                >
                  <td>
                    <div>{pass.nameEn}</div>
                    {pass.requiresClass && (
                      <div className="admin-table__sub">
                        {t(
                          pass.requiresDate
                            ? "admin.passes.requiresDate"
                            : "admin.passes.requiresClass"
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {t(`classes.passes.categories.${pass.category}`)}
                    {!pass.isActive && (
                      <div className="admin-table__sub">
                        {t("admin.hidden")}
                      </div>
                    )}
                  </td>
                  <td className="admin-table__number tabular">
                    {format.money(pass.priceCents, pass.currency)}
                  </td>
                  <td className="tabular">{pass.sortOrder}</td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      onClick={() =>
                        setForm({
                          id: pass.id,
                          category: pass.category,
                          nameEn: pass.nameEn,
                          nameFr: pass.nameFr ?? "",
                          nameEs: pass.nameEs ?? "",
                          detailsEn: pass.detailsEn ?? "",
                          detailsFr: pass.detailsFr ?? "",
                          detailsEs: pass.detailsEs ?? "",
                          price: centsToDollars(pass.priceCents),
                          currency: pass.currency,
                          requiresClass: pass.requiresClass,
                          requiresDate: pass.requiresDate,
                          sortOrder: String(pass.sortOrder),
                          isActive: pass.isActive,
                        })
                      }
                    >
                      {t("admin.edit")}
                    </button>
                    <button
                      type="button"
                      className="button button--quiet button--small admin-table__danger"
                      onClick={() => void removePass(pass.id)}
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
          form?.id === null ? t("admin.passes.add") : t("admin.passes.edit")
        }
      >
        {form && (
          <form className="admin-form" onSubmit={save}>
            <label className="field">
              <span className="field__label">{t("admin.passes.category")}</span>
              <select
                className="field__select"
                value={form.category}
                onChange={event =>
                  setForm({ ...form, category: event.target.value as Category })
                }
              >
                <option value="classes">
                  {t("classes.passes.categories.classes")}
                </option>
                <option value="rehearsal">
                  {t("classes.passes.categories.rehearsal")}
                </option>
              </select>
            </label>
            {LANGS.map(([suffix, language]) => (
              <fieldset key={suffix} className="admin-form__group">
                <legend>{language}</legend>
                <label className="field">
                  <span className="field__label">{t("admin.passes.name")}</span>
                  <input
                    className="field__input"
                    required={suffix === "En"}
                    maxLength={80}
                    value={form[`name${suffix}`]}
                    onChange={event =>
                      setForm({
                        ...form,
                        [`name${suffix}`]: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field__label">
                    {t("admin.passes.details")}{" "}
                    <span className="field__optional">
                      {t("common.optional")}
                    </span>
                  </span>
                  <input
                    className="field__input"
                    maxLength={200}
                    value={form[`details${suffix}`]}
                    onChange={event =>
                      setForm({
                        ...form,
                        [`details${suffix}`]: event.target.value,
                      })
                    }
                  />
                </label>
              </fieldset>
            ))}
            <div className="admin-form__row">
              <label className="field">
                <span className="field__label">
                  {t("admin.passes.priceDollars")}
                </span>
                <input
                  className="field__input"
                  inputMode="decimal"
                  required
                  value={form.price}
                  onChange={event =>
                    setForm({ ...form, price: event.target.value })
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
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.requiresClass}
                onChange={event =>
                  setForm({ ...form, requiresClass: event.target.checked })
                }
              />
              {t("admin.passes.requiresClass")}
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.requiresClass && form.requiresDate}
                disabled={!form.requiresClass}
                onChange={event =>
                  setForm({ ...form, requiresDate: event.target.checked })
                }
              />
              {t("admin.passes.requiresDate")}
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={event =>
                  setForm({ ...form, isActive: event.target.checked })
                }
              />
              {t("admin.passes.visible")}
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
