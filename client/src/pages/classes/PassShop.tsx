import { useTranslation } from "react-i18next";
import { currentLanguage, localized, useFormat } from "@/lib/format";

export type Pass = {
  id: number;
  category: "classes" | "rehearsal";
  nameEn: string;
  nameFr: string | null;
  nameEs: string | null;
  detailsEn: string | null;
  detailsFr: string | null;
  detailsEs: string | null;
  priceCents: number;
  currency: string;
  /** The customer chooses the one class the pass is for. */
  requiresClass: boolean;
};

const CATEGORIES = ["classes", "rehearsal"] as const;

export function passName(language: string, pass: Pass): string {
  return localized(currentLanguage(language), {
    en: pass.nameEn,
    fr: pass.nameFr,
    es: pass.nameEs,
  });
}

export function PassList({
  passes,
  onBuy,
  compact = false,
}: {
  passes: Pass[];
  onBuy: (pass: Pass) => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const language = currentLanguage(i18n.resolvedLanguage ?? i18n.language);

  return (
    <>
      {CATEGORIES.map(category => {
        const group = passes.filter(pass => pass.category === category);
        if (!group.length) return null;
        return (
          <div key={category} className="pass-group">
            <h3 className="pass-group__title">
              {t(`classes.passes.categories.${category}`)}
            </h3>
            <ul
              className={compact ? "pass-list pass-list--compact" : "pass-list"}
              role="list"
            >
              {group.map(pass => {
                const name = passName(language, pass);
                const details = localized(language, {
                  en: pass.detailsEn,
                  fr: pass.detailsFr,
                  es: pass.detailsEs,
                });
                return (
                  <li key={pass.id} className="pass-card">
                    <div className="pass-card__text">
                      <span className="pass-card__name">{name}</span>
                      {details && (
                        <span className="pass-card__details">{details}</span>
                      )}
                    </div>
                    <span className="pass-card__price tabular">
                      {format.money(pass.priceCents, pass.currency)}
                    </span>
                    <button
                      type="button"
                      className="button button--outline button--small pass-card__buy"
                      onClick={() => onBuy(pass)}
                      aria-label={t("classes.passes.buyNamed", { name })}
                    >
                      {t("classes.passes.buy")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

export default function PassShop({
  passes,
  onBuy,
}: {
  passes: Pass[];
  onBuy: (pass: Pass) => void;
}) {
  const { t } = useTranslation();
  if (!passes.length) return null;

  return (
    <section
      id="passes"
      className="container pass-shop"
      aria-labelledby="pass-shop-title"
    >
      <div className="pass-shop__header">
        <h2 id="pass-shop-title" className="section-title">
          {t("classes.passes.title")}
        </h2>
        <p className="lead">{t("classes.passes.intro")}</p>
      </div>
      <div className="pass-shop__groups">
        <PassList passes={passes} onBuy={onBuy} />
      </div>
    </section>
  );
}
