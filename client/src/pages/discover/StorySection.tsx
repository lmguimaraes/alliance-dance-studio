import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { PATHS } from "@/lib/brand";

const FAMILY = [
  { key: "alliance", href: PATHS.home },
  { key: "company", href: PATHS.discover("company") },
  { key: "academy", href: PATHS.classes },
  { key: "studio", href: PATHS.rental },
] as const;

export default function StorySection() {
  const { t } = useTranslation();
  return (
    <div className="story">
      <div className="story__text">
        <p>{t("discover.story.history")}</p>
        <p>{t("discover.story.mission")}</p>
      </div>
      <section className="brand-family" aria-labelledby="brand-family-title">
        <h2 id="brand-family-title" className="section-title">
          {t("discover.story.familyTitle")}
        </h2>
        <ul className="brand-family__list" role="list">
          {FAMILY.map(member => (
            <li key={member.key}>
              <Link href={member.href} className="brand-family__item">
                <span className="brand-family__name">
                  {t(`discover.story.family.${member.key}.name`)}
                </span>
                <span className="brand-family__role">
                  {t(`discover.story.family.${member.key}.role`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
