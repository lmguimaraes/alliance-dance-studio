import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Facebook, Instagram, Mail, MapPin } from "lucide-react";
import { AREAS, BRAND, PATHS } from "@/lib/brand";

export default function SiteFooter() {
  const { t } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__main">
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

          <nav className="site-footer__column" aria-labelledby="footer-explore">
            <h2 id="footer-explore" className="site-footer__heading">
              {t("footer.explore")}
            </h2>
            <ul className="site-footer__list" role="list">
              {AREAS.map(area => (
                <li key={area.key}>
                  <Link href={area.href} className="site-footer__link">
                    {t(`areas.${area.key}.name`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="site-footer__column">
            <h2 className="site-footer__heading">{t("footer.connect")}</h2>
            <ul className="site-footer__list site-footer__contact" role="list">
              <li>
                <a href={`mailto:${BRAND.email}`}>
                  <Mail aria-hidden="true" />
                  <span>{BRAND.email}</span>
                </a>
              </li>
              <li>
                <a href={BRAND.instagramUrl} target="_blank" rel="noreferrer">
                  <Instagram aria-hidden="true" />
                  <span>
                    <span className="visually-hidden">Instagram: </span>
                    {`@${BRAND.instagramHandle}`}
                  </span>
                </a>
              </li>
              <li>
                <a href={BRAND.facebookUrl} target="_blank" rel="noreferrer">
                  <Facebook aria-hidden="true" />
                  <span>
                    <span className="visually-hidden">Facebook: </span>
                    {BRAND.facebookName}
                  </span>
                </a>
              </li>
              <li>
                <span className="site-footer__place">
                  <MapPin aria-hidden="true" />
                  <span>{t("common.location")}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="site-footer__row">
          <p className="site-footer__meta">
            © {new Date().getFullYear()} {BRAND.legalName}
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
