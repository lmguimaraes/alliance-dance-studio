import { useTranslation } from "react-i18next";
import type { Audience } from "@shared/booking";
import { useCart } from "./CartContext";

const OPTIONS: Audience[] = ["private", "group"];

/** Private or group rental. Rates differ; the choice applies to the whole order. */
export default function RentalTypeToggle() {
  const { t } = useTranslation();
  const { cart, setAudience } = useCart();

  return (
    <div
      className="rental-type"
      role="radiogroup"
      aria-label={t("rental.type.label")}
    >
      <span className="rental-type__label">{t("rental.type.label")}</span>
      <div className="segmented">
        {OPTIONS.map(option => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={cart.audience === option}
            className="segmented__option"
            onClick={() => setAudience(option)}
          >
            {t(`rental.type.${option}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
