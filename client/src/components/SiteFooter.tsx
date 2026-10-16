import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Instagram, Mail } from "lucide-react";
import { BRAND, PATHS } from "@/lib/brand";

export default function SiteFooter() {
  const { t } = useTranslation();
  const links = [
    { href: PATHS.discover(), label: t("nav.discover") },
    { href: PATHS.classes, label: t("nav.classes") },
    { href: PATHS.rental, label: t("nav.rental") },
    { href: PATHS.contact, label: t("nav.contact") },
  ];

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__row">
          <Link
            href={PATHS.home}
            className="site-footer__mark"
            aria-label={t("nav.home")}
          >
            <img
              src={BRAND.logos.mark}
              alt=""
              width={34}
              height={52}
              loading="lazy"
            />
          </Link>
          <nav className="site-footer__links" aria-label={t("nav.footer")}>
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="site-footer__link"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="site-footer__contact">
            <a href={`mailto:${BRAND.email}`}>
              <Mail aria-hidden="true" />
              {BRAND.email}
            </a>
            <a href={BRAND.instagramUrl} target="_blank" rel="noreferrer">
              <Instagram aria-hidden="true" />
              Instagram
            </a>
          </div>
        </div>
        <div className="site-footer__row">
          <p className="site-footer__meta">
            © {new Date().getFullYear()} {BRAND.name}. {BRAND.city}
          </p>
          <Link
            href={PATHS.admin}
            className="site-footer__link site-footer__meta"
          >
            {t("nav.admin")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
