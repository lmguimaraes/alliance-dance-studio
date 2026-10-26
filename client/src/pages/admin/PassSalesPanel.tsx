import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";

type Filter = "paid" | "all";

const STATUS_TAG = {
  paid: "confirmed",
  checkout_pending: "pending",
  expired: "cancelled",
  cancelled: "cancelled",
} as const;

/** Passes bought on the website. Read only: refunds are made in Stripe. */
export default function PassSalesPanel() {
  const { t } = useTranslation();
  const format = useFormat();
  const [filter, setFilter] = useState<Filter>("paid");
  const [search, setSearch] = useState("");
  const list = trpc.admin.passSales.list.useQuery(
    { status: filter, search: search.trim() || undefined },
    { placeholderData: previous => previous }
  );
  const sales = list.data ?? [];
  const paid = sales.filter(sale => sale.status === "paid");
  const paidTotal = paid.reduce((total, sale) => total + sale.amountCents, 0);

  return (
    <section className="admin-panel" aria-labelledby="pass-sales-title">
      <div className="admin-panel__header">
        <h1 id="pass-sales-title" className="admin-panel__title">
          {t("admin.tabs.passSales")}
        </h1>
      </div>
      <p className="admin-panel__help">{t("admin.passSales.help")}</p>

      <div className="admin-toolbar">
        <div
          className="segmented"
          role="radiogroup"
          aria-label={t("admin.passSales.show")}
        >
          {(["paid", "all"] as Filter[]).map(option => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={filter === option}
              className="segmented__option"
              onClick={() => setFilter(option)}
            >
              {t(`admin.passSales.filters.${option}`)}
            </button>
          ))}
        </div>
        <input
          className="field__input admin-toolbar__search"
          type="search"
          placeholder={t("admin.passSales.search")}
          aria-label={t("admin.passSales.search")}
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </div>

      {list.isLoading ? (
        <p className="admin-panel__state">{t("common.loading")}</p>
      ) : list.error ? (
        <p className="notice notice--error">{t("errors.loadBody")}</p>
      ) : sales.length === 0 ? (
        <p className="admin-panel__state">{t("admin.passSales.empty")}</p>
      ) : (
        <>
          <p className="admin-panel__summary">
            {t("admin.passSales.summary", {
              count: paid.length,
              total: format.money(paidTotal, sales[0].currency),
            })}
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("admin.passSales.date")}</th>
                  <th>{t("admin.passSales.customer")}</th>
                  <th>{t("admin.passSales.pass")}</th>
                  <th>{t("admin.passSales.status")}</th>
                  <th className="admin-table__number">
                    {t("admin.passSales.amount")}
                  </th>
                  <th>
                    <span className="visually-hidden">
                      {t("admin.passSales.stripe")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => {
                  const when = sale.paidAt ?? sale.createdAt;
                  return (
                    <tr
                      key={sale.id}
                      className={
                        sale.status === "paid"
                          ? undefined
                          : "admin-table__row--muted"
                      }
                    >
                      <td className="tabular">
                        <div>{format.shortDate(when.slice(0, 10))}</div>
                        <div className="admin-table__sub">
                          {format.time(when.slice(11, 16))}
                        </div>
                      </td>
                      <td>
                        <div>{sale.customerName}</div>
                        <div className="admin-table__sub">
                          {sale.customerEmail}
                        </div>
                      </td>
                      <td>
                        <div>{sale.passName}</div>
                        {sale.classLabel && (
                          <div className="admin-table__sub">
                            {sale.classLabel}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-tag status-tag--${STATUS_TAG[sale.status]}`}
                        >
                          {t(`admin.passSales.statuses.${sale.status}`)}
                        </span>
                      </td>
                      <td className="admin-table__number tabular">
                        {format.money(sale.amountCents, sale.currency)}
                      </td>
                      <td className="admin-table__actions">
                        {sale.stripeUrl && (
                          <a
                            className="button button--quiet button--small"
                            href={sale.stripeUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("admin.passSales.stripe")}
                            <ExternalLink aria-hidden="true" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
