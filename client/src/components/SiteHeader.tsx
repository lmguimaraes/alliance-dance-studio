import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { ChevronDown, Menu, ShoppingBag, X } from "lucide-react";
import { useCart } from "@/features/cart/CartContext";
import { BRAND, DISCOVER_SECTIONS, PATHS } from "@/lib/brand";
import { cx } from "@/lib/cx";
import LanguageSwitcher from "./LanguageSwitcher";

function isCurrent(location: string, path: string): boolean {
  return path === "/"
    ? location === "/"
    : location === path || location.startsWith(`${path}/`);
}

export default function SiteHeader() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { cart, open: openCart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const discoverRef = useRef<HTMLDivElement>(null);

  const links = [
    { path: PATHS.classes, label: t("nav.classes") },
    { path: PATHS.rental, label: t("nav.rental") },
    { path: PATHS.contact, label: t("nav.contact") },
  ];
  const inDiscover = location.startsWith("/discover");
  const showCart = cart.items.length > 0 || location.startsWith(PATHS.rental);

  // Close menus on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setDiscoverOpen(false);
  }, [location]);

  useEffect(() => {
    document.documentElement.classList.toggle("has-modal", menuOpen);
  }, [menuOpen]);

  useEffect(() => {
    if (!discoverOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!discoverRef.current?.contains(event.target as Node))
        setDiscoverOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDiscoverOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [discoverOpen]);

  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link
            href={PATHS.home}
            className="site-header__logo"
            aria-label={t("nav.home")}
          >
            <img
              src={BRAND.logos.header}
              alt={BRAND.name}
              width={89}
              height={44}
            />
          </Link>

          <nav className="site-nav" aria-label={t("nav.main")}>
            <div className="discover-menu" ref={discoverRef}>
              <button
                type="button"
                className={cx(
                  "discover-menu__trigger",
                  inDiscover && "discover-menu__trigger--active"
                )}
                aria-expanded={discoverOpen}
                aria-controls="discover-menu-panel"
                onClick={() => setDiscoverOpen(open => !open)}
              >
                {t("nav.discover")}
                <ChevronDown
                  className="discover-menu__chevron"
                  aria-hidden="true"
                />
              </button>
              <div
                id="discover-menu-panel"
                className="discover-menu__panel"
                hidden={!discoverOpen}
              >
                {DISCOVER_SECTIONS.map(section => (
                  <Link
                    key={section}
                    href={PATHS.discover(section)}
                    className={cx(
                      "discover-menu__item",
                      location === PATHS.discover(section) &&
                        "discover-menu__item--active"
                    )}
                    aria-current={
                      location === PATHS.discover(section) ? "page" : undefined
                    }
                  >
                    {t(`discover.sections.${section}.label`)}
                  </Link>
                ))}
              </div>
            </div>
            {links.map(link => (
              <Link
                key={link.path}
                href={link.path}
                className={cx(
                  "site-nav__link",
                  isCurrent(location, link.path) && "site-nav__link--active"
                )}
                aria-current={
                  isCurrent(location, link.path) ? "page" : undefined
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="site-header__tools">
            <LanguageSwitcher />
            {showCart && (
              <button
                type="button"
                className="cart-button"
                onClick={openCart}
                aria-label={t("cart.open", { count: cart.items.length })}
              >
                <ShoppingBag aria-hidden="true" />
                {cart.items.length > 0 && (
                  <span className="cart-button__count">
                    {cart.items.length}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
              onClick={() => setMenuOpen(open => !open)}
            >
              {menuOpen ? (
                <X aria-hidden="true" />
              ) : (
                <Menu aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>
      <div id="mobile-menu" className="mobile-menu" hidden={!menuOpen}>
        <nav className="container" aria-label={t("nav.main")}>
          <div className="mobile-menu__links">
            <span
              className={cx(
                "mobile-menu__link",
                inDiscover && "mobile-menu__link--active"
              )}
            >
              {t("nav.discover")}
            </span>
            <div className="mobile-menu__group">
              {DISCOVER_SECTIONS.map(section => (
                <Link
                  key={section}
                  href={PATHS.discover(section)}
                  className={cx(
                    "mobile-menu__sublink",
                    location === PATHS.discover(section) &&
                      "mobile-menu__sublink--active"
                  )}
                >
                  {t(`discover.sections.${section}.label`)}
                </Link>
              ))}
            </div>
            {links.map(link => (
              <Link
                key={link.path}
                href={link.path}
                className={cx(
                  "mobile-menu__link",
                  isCurrent(location, link.path) && "mobile-menu__link--active"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <LanguageSwitcher />
        </nav>
      </div>
    </>
  );
}
