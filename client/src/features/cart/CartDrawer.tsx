import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import Dialog from "@/components/Dialog";
import { PATHS } from "@/lib/brand";
import { useFormat } from "@/lib/format";
import { useCart } from "./CartContext";
import { cartTotal, itemAmount } from "./cartModel";
import CartItemSummary from "./CartItemSummary";
import RentalTypeToggle from "./RentalTypeToggle";
import "./cart.css";

export default function CartDrawer() {
  const { t } = useTranslation();
  const format = useFormat();
  const { cart, isOpen, close, remove, clear } = useCart();
  const isEmpty = cart.items.length === 0;

  return (
    <Dialog
      open={isOpen}
      onClose={close}
      variant="drawer"
      title={t("cart.title")}
      subtitle={
        isEmpty ? undefined : t("cart.count", { count: cart.items.length })
      }
      footer={
        isEmpty ? null : (
          <footer className="cart-drawer__footer">
            <div className="cart-total">
              <span>{t("cart.estimatedTotal")}</span>
              <strong className="tabular">
                {format.money(cartTotal(cart))}
              </strong>
            </div>
            <p className="cart-drawer__note">{t("cart.finalPriceNote")}</p>
            <Link
              href={PATHS.checkout}
              className="button button--primary button--block"
              onClick={close}
            >
              {t("cart.checkout")}
            </Link>
            <button
              type="button"
              className="button button--quiet button--block"
              onClick={clear}
            >
              {t("cart.clear")}
            </button>
          </footer>
        )
      }
    >
      {isEmpty ? (
        <div className="empty-state">
          <p>{t("cart.empty")}</p>
          <Link
            href={PATHS.rental}
            className="button button--outline"
            onClick={close}
          >
            {t("cart.browseStudios")}
          </Link>
        </div>
      ) : (
        <div className="cart-drawer__content">
          <RentalTypeToggle />
          <ul className="cart-list" role="list">
            {cart.items.map(item => (
              <li key={item.id} className="cart-item">
                <CartItemSummary
                  item={item}
                  amount={itemAmount(item, cart.audience)}
                />
                <button
                  type="button"
                  className="button button--quiet cart-item__remove"
                  onClick={() => remove(item.id)}
                  aria-label={t("cart.removeItem", { name: item.spaceName })}
                >
                  {t("cart.remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
