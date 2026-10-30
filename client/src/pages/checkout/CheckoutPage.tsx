import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { TRPCClientError } from "@trpc/client";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Loader2, LockKeyhole } from "lucide-react";
import {
  BOOKING_WINDOW_DAYS,
  type Audience,
  type OccurrenceProblem,
} from "@shared/booking";
import PageHeader from "@/components/PageHeader";
import { useCart } from "@/features/cart/CartContext";
import CartItemSummary from "@/features/cart/CartItemSummary";
import { toRentalItems } from "@/features/cart/cartModel";
import { BRAND, PATHS } from "@/lib/brand";
import { currentLanguage, useFormat } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/usePageMeta";
import "@/features/cart/cart.css";
import "./checkout.css";

type Summary = {
  reservationId: string;
  status: "checkout_pending" | "paid" | "expired" | "cancelled";
  amountTotal: number;
  currency: string;
  customerEmail: string;
  items: {
    spaceName: string;
    audience: Audience;
    date: string;
    startTime: string;
    endTime: string;
  }[];
};

type ReturnState =
  | { kind: "none" }
  | { kind: "confirming" }
  | { kind: "confirmed"; summary: Summary }
  | { kind: "confirm_failed" }
  | { kind: "cancelled" };

function readReturn(): {
  checkout: string | null;
  sessionId: string | null;
  reservationId: string | null;
  cancelToken: string | null;
} {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return {
    checkout: query.get("checkout"),
    sessionId: query.get("session_id"),
    reservationId: hash.get("reservation_id"),
    cancelToken: hash.get("cancel_token"),
  };
}

function cleanUrl() {
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname
  );
}

function Confirmation({ summary }: { summary: Summary }) {
  const { t } = useTranslation();
  const format = useFormat();
  const paid = summary.status === "paid";

  return (
    <>
      <PageHeader
        title={
          paid ? t("checkout.confirmed.title") : t("checkout.processing.title")
        }
        intro={
          paid ? t("checkout.confirmed.intro") : t("checkout.processing.intro")
        }
      />
      <section className="container booking-confirmation">
        <dl className="booking-confirmation__facts">
          <div>
            <dt>{t("checkout.confirmed.reference")}</dt>
            <dd className="tabular">{summary.reservationId}</dd>
          </div>
          <div>
            <dt>{t("checkout.confirmed.total")}</dt>
            <dd className="tabular">
              {format.money(summary.amountTotal, summary.currency)}
            </dd>
          </div>
          <div>
            <dt>{t("checkout.form.email")}</dt>
            <dd>{summary.customerEmail}</dd>
          </div>
        </dl>
        <ul className="order-lines" role="list">
          {summary.items.map(item => (
            <li
              key={`${item.date}-${item.startTime}-${item.spaceName}`}
              className="order-line"
            >
              <CartItemSummary item={{ ...item, weeks: 1 }} amount={null} />
            </li>
          ))}
        </ul>
        <p className="booking-confirmation__help">
          {t("checkout.confirmed.help")}{" "}
          <a className="text-link" href={`mailto:${BRAND.email}`}>
            {BRAND.email}
          </a>
        </p>
        <div className="button-row">
          <Link href={PATHS.rental} className="button button--primary">
            {t("checkout.confirmed.bookAnother")}
          </Link>
          <Link href={PATHS.home} className="button button--outline">
            {t("notFound.home")}
          </Link>
        </div>
      </section>
    </>
  );
}

function problemText(problem: OccurrenceProblem, t: TFunction): string {
  return t(`checkout.problems.${problem}`, { days: BOOKING_WINDOW_DAYS });
}

export default function CheckoutPage() {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const { cart, remove, clear } = useCart();
  usePageMeta(t("checkout.title"));

  const [returnState, setReturnState] = useState<ReturnState>({ kind: "none" });
  const [contact, setContact] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const started = useRef(false);

  const confirm = trpc.rental.confirm.useMutation();
  const cancel = trpc.rental.cancel.useMutation();
  const checkout = trpc.rental.checkout.useMutation();
  const utils = trpc.useUtils();

  // Returning from Stripe.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = readReturn();

    if (params.checkout === "success" && params.sessionId) {
      setReturnState({ kind: "confirming" });
      confirm
        .mutateAsync({ sessionId: params.sessionId })
        .then(summary => {
          setReturnState({ kind: "confirmed", summary });
          if (
            summary.status === "paid" ||
            summary.status === "checkout_pending"
          )
            clear();
        })
        .catch(() => setReturnState({ kind: "confirm_failed" }))
        .finally(cleanUrl);
    } else if (params.checkout === "cancelled") {
      setReturnState({ kind: "cancelled" });
      if (params.reservationId && params.cancelToken) {
        cancel
          .mutateAsync({
            reservationId: params.reservationId,
            cancelToken: params.cancelToken,
          })
          .then(summary => {
            if (summary.status === "paid") {
              setReturnState({ kind: "confirmed", summary });
              clear();
            }
          })
          .catch(() => undefined)
          .finally(() => {
            cleanUrl();
            void utils.rental.invalidate();
          });
      } else {
        cleanUrl();
      }
    }
    // Runs once on arrival.
  }, [cancel, clear, confirm, utils.rental]);

  const items = useMemo(() => toRentalItems(cart.items), [cart.items]);
  const quoteQuery = trpc.rental.quote.useQuery(
    { items },
    {
      enabled: items.length > 0 && returnState.kind !== "confirmed",
      staleTime: 0,
      refetchInterval: 60_000,
    }
  );
  const quote = quoteQuery.data;
  const quoteMatchesCart = quote?.items.length === cart.items.length;
  const canPay =
    Boolean(quote?.available && quoteMatchesCart) && !checkout.isPending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    try {
      const result = await checkout.mutateAsync({
        items,
        customerName: contact.name,
        customerEmail: contact.email,
        customerPhone: contact.phone || null,
        notes: contact.notes || null,
        locale: currentLanguage(i18n.resolvedLanguage ?? i18n.language),
      });
      if (result.status === "redirect") {
        window.location.assign(result.checkoutUrl);
        return;
      }
      utils.rental.quote.setData({ items }, result.quote);
      setSubmitError(t("checkout.unavailable"));
    } catch (error) {
      setSubmitError(
        error instanceof TRPCClientError &&
          error.data?.code === "TOO_MANY_REQUESTS"
          ? t("errors.tooMany")
          : t("checkout.failed")
      );
    }
  }

  if (returnState.kind === "confirming") {
    return (
      <PageHeader
        title={t("checkout.confirming.title")}
        intro={
          <span className="checkout__confirming">
            <Loader2 className="spinner" aria-hidden="true" />{" "}
            {t("checkout.confirming.intro")}
          </span>
        }
      />
    );
  }

  if (returnState.kind === "confirmed")
    return <Confirmation summary={returnState.summary} />;

  return (
    <>
      <PageHeader title={t("checkout.title")} />

      <div className="container checkout">
        {returnState.kind === "cancelled" && (
          <div className="notice checkout__banner" role="status">
            <strong>{t("checkout.cancelled.title")}</strong>
            {t("checkout.cancelled.body")}
          </div>
        )}
        {returnState.kind === "confirm_failed" && (
          <div className="notice notice--error checkout__banner" role="alert">
            <strong>{t("checkout.confirmFailed.title")}</strong>
            {t("checkout.confirmFailed.body", { email: BRAND.email })}
          </div>
        )}

        {cart.items.length === 0 ? (
          <div className="empty-state">
            <p>{t("checkout.empty")}</p>
            <Link href={PATHS.rental} className="button button--primary">
              {t("cart.browseStudios")}
            </Link>
          </div>
        ) : (
          <form
            className="checkout__layout"
            onSubmit={submit}
            noValidate={false}
          >
            <section
              className="checkout__booking"
              aria-labelledby="checkout-booking-title"
            >
              <h2 id="checkout-booking-title" className="checkout__heading">
                {t("checkout.booking")}
              </h2>
              <ul className="order-lines" role="list">
                {cart.items.map((item, index) => {
                  const quoted = quoteMatchesCart
                    ? quote?.items[index]
                    : undefined;
                  const problems =
                    quoted?.occurrences.filter(
                      occurrence => occurrence.problem
                    ) ?? [];
                  const amount = quoted
                    ? quoted.occurrenceAmount * quoted.occurrences.length
                    : null;
                  return (
                    <li key={item.id} className="order-line">
                      <CartItemSummary
                        item={item}
                        amount={amount}
                        currency={quote?.currency}
                      />
                      {problems.length > 0 && (
                        <ul className="order-line__problems" role="list">
                          {problems.map(problem => (
                            <li key={problem.date}>
                              {format.shortDate(problem.date)}:{" "}
                              {problemText(
                                problem.problem as OccurrenceProblem,
                                t
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        className="button button--quiet order-line__remove"
                        onClick={() => remove(item.id)}
                      >
                        {t("cart.remove")}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Link href={PATHS.rental} className="text-link">
                {t("checkout.addMore")}
              </Link>
            </section>

            <section
              className="checkout__details"
              aria-labelledby="checkout-details-title"
            >
              <h2 id="checkout-details-title" className="checkout__heading">
                {t("checkout.details")}
              </h2>
              <label className="field">
                <span className="field__label">{t("checkout.form.name")}</span>
                <input
                  className="field__input"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={contact.name}
                  onChange={event =>
                    setContact(current => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">{t("checkout.form.email")}</span>
                <input
                  className="field__input"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={contact.email}
                  onChange={event =>
                    setContact(current => ({
                      ...current,
                      email: event.target.value,
                    }))
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
                  autoComplete="tel"
                  maxLength={40}
                  value={contact.phone}
                  onChange={event =>
                    setContact(current => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {t("checkout.form.notes")}{" "}
                  <span className="field__optional">
                    {t("common.optional")}
                  </span>
                </span>
                <textarea
                  className="field__textarea"
                  maxLength={1000}
                  value={contact.notes}
                  onChange={event =>
                    setContact(current => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </section>

            <aside
              className="order-summary"
              aria-labelledby="order-summary-title"
            >
              <h2 id="order-summary-title" className="visually-hidden">
                {t("checkout.summary")}
              </h2>
              <div className="order-summary__total">
                <span>{t("checkout.total")}</span>
                {quoteQuery.isFetching && !quote ? (
                  <Loader2
                    className="spinner"
                    aria-label={t("common.loading")}
                  />
                ) : (
                  <strong className="tabular">
                    {quote ? format.money(quote.total, quote.currency) : "–"}
                  </strong>
                )}
              </div>
              {quoteQuery.error && (
                <p className="field__error" role="alert">
                  {t("checkout.quoteFailed")}
                </p>
              )}
              {quote && !quote.available && (
                <p className="field__error" role="alert">
                  {t("checkout.resolveProblems")}
                </p>
              )}
              {submitError && (
                <p className="field__error" role="alert">
                  {submitError}
                </p>
              )}
              <button
                type="submit"
                className="button button--primary button--block"
                disabled={!canPay}
              >
                {checkout.isPending ? (
                  <Loader2 className="spinner" aria-hidden="true" />
                ) : (
                  <LockKeyhole aria-hidden="true" />
                )}
                {checkout.isPending
                  ? t("checkout.redirecting")
                  : t("checkout.pay")}
              </button>
              <p className="order-summary__note">{t("checkout.stripeNote")}</p>
            </aside>
          </form>
        )}
      </div>
    </>
  );
}
