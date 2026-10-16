import { useTranslation } from "react-i18next";
import { timeToMinutes } from "@shared/booking";
import { useFormat } from "@/lib/format";
import { lastDateOf, type CartItem } from "./cartModel";

type Props = {
  item: Pick<
    CartItem,
    "spaceName" | "date" | "startTime" | "endTime" | "weeks"
  >;
  amount: number | null;
  currency?: string;
};

/** Studio, date, time and weekly repeat of one cart line. */
export default function CartItemSummary({ item, amount, currency }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const minutes = timeToMinutes(item.endTime) - timeToMinutes(item.startTime);

  return (
    <div className="cart-item__summary">
      <div className="cart-item__heading">
        <h3 className="cart-item__name">{item.spaceName}</h3>
        {amount !== null && (
          <span className="cart-item__amount tabular">
            {format.money(amount, currency)}
          </span>
        )}
      </div>
      <p className="cart-item__when">{format.fullDate(item.date)}</p>
      <p className="cart-item__when tabular">
        {format.timeRange(item.startTime, item.endTime)}
        <span className="cart-item__duration">{format.duration(minutes)}</span>
      </p>
      {item.weeks > 1 && (
        <p className="cart-item__repeat">
          {t("cart.weeklyUntil", {
            count: item.weeks,
            date: format.monthDay(lastDateOf(item)),
          })}
        </p>
      )}
    </div>
  );
}
