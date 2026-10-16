import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { AREAS, PATHS } from "@/lib/brand";
import { usePageMeta } from "@/lib/usePageMeta";
import "./home.css";

export default function HomePage() {
  const { t } = useTranslation();
  usePageMeta(null, t("home.meta"));

  return (
    <>
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="container home-hero__layout">
          <p className="home-hero__eyebrow">{t("home.hero.eyebrow")}</p>
          <h1 id="home-hero-title" className="home-hero__title">
            {(t("home.hero.title").match(/[^.!?]+[.!?]*/g) ?? [])
              .map(sentence => sentence.trim())
              .filter(Boolean)
              .map(sentence => (
                <span key={sentence} className="home-hero__line">
                  {sentence}
                </span>
              ))}
          </h1>
          <div className="home-hero__body">
            <div className="home-hero__lead">
              <p className="home-hero__tagline">{t("home.hero.tagline")}</p>
              <div className="beat" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="home-hero__story">
              <p className="lead">{t("home.hero.intro")}</p>
              <div className="home-hero__actions">
                <Link href={PATHS.classes} className="button button--primary">
                  {t("home.hero.classes")}
                </Link>
                <Link href={PATHS.rental} className="button button--outline">
                  {t("home.hero.rental")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <nav className="container pillars-strip" aria-label={t("areas.label")}>
        {AREAS.map(area => (
          <Link key={area.key} href={area.href} className="pillars-strip__item">
            <strong className="pillars-strip__word">
              {t(`areas.${area.key}.name`)}
            </strong>
            <span className="pillars-strip__label">
              {t(`areas.${area.key}.summary`)}
            </span>
          </Link>
        ))}
      </nav>

      <section className="home-cta" aria-labelledby="home-cta-title">
        <div className="container home-cta__inner">
          <div className="home-cta__text">
            <h2 id="home-cta-title" className="section-title home-cta__title">
              {t("home.cta.title")}
            </h2>
            <p className="lead">{t("home.cta.body")}</p>
          </div>
          <Link href={PATHS.contact} className="button button--primary">
            {t("home.cta.action")}
          </Link>
        </div>
      </section>
    </>
  );
}
