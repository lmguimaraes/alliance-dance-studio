import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { PATHS } from "@/lib/brand";
import { usePageMeta } from "@/lib/usePageMeta";
import "./home.css";

const PILLARS = [
  { key: "train", href: PATHS.classes },
  { key: "perform", href: PATHS.discover("company") },
  { key: "create", href: PATHS.rental },
  { key: "belong", href: PATHS.discover("story") },
] as const;

export default function HomePage() {
  const { t } = useTranslation();
  usePageMeta(null, t("home.meta"));

  return (
    <>
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="container home-hero__layout">
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
          <div className="beat home-hero__beat" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="home-hero__body">
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
      </section>

      <nav
        className="container pillars-strip"
        aria-label={t("home.pillars.label")}
      >
        {PILLARS.map(pillar => (
          <Link
            key={pillar.key}
            href={pillar.href}
            className="pillars-strip__item"
          >
            <strong className="pillars-strip__word">
              {t(`home.pillars.${pillar.key}.word`)}
            </strong>
            <span className="pillars-strip__label">
              {t(`home.pillars.${pillar.key}.label`)}
            </span>
          </Link>
        ))}
      </nav>

      <section className="container home-cta" aria-labelledby="home-cta-title">
        <h2 id="home-cta-title" className="section-title home-cta__title">
          {t("home.cta.title")}
        </h2>
        <Link href={PATHS.contact} className="button button--primary">
          {t("home.cta.action")}
        </Link>
      </section>
    </>
  );
}
