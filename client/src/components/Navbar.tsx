import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { APP_TITLE, BRAND_LOGOS } from "@/const";

const languages = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
];

const isActive = (location: string, path: string) => {
  if (path === "/") {
    return location === "/";
  }

  return location.startsWith(path);
};

const getLogoForRoute = (location: string) => {
  if (location.startsWith("/about") || location.startsWith("/gallery")) {
    return BRAND_LOGOS.danceCo.horizontal;
  }

  return BRAND_LOGOS.alliance.horizontal;
};

export default function Navbar() {
  const [location] = useLocation();
  const { t, i18n } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const logo = getLogoForRoute(location);

  const navItems = [
    { path: "/", label: t("nav.home") },
    { path: "/about", label: t("nav.about") },
    { path: "/classes", label: t("nav.classes") },
    { path: "/studio-rental", label: t("nav.studioRental") },
    { path: "/gallery", label: t("nav.gallery") },
  ];

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="container">
        <div className="flex h-20 items-center justify-between gap-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`${APP_TITLE} home`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <img
              src={logo}
              alt={APP_TITLE}
              className="h-12 w-auto max-w-[190px] object-contain md:h-14"
            />
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const active = isActive(location, item.path);

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center rounded-full border border-border/70 bg-card/60 p-1 sm:flex">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors ${
                    i18n.language === lang.code
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  type="button"
                  aria-label={`Switch language to ${lang.label}`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <Link
              href="/contact"
              className="hidden rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 md:inline-flex"
            >
              Contact
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-border/70 py-5 lg:hidden">
            <div className="flex flex-col gap-2">
              {[...navItems, { path: "/contact", label: "Contact" }].map((item) => {
                const active = isActive(location, item.path);

                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-border/70 pt-4 sm:hidden">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
                    i18n.language === lang.code
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                  type="button"
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
