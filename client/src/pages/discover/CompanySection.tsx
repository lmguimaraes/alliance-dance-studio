import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { PATHS } from "@/lib/brand";

const FOCUS_AREAS = ["direction", "work", "community"] as const;

export default function CompanySection() {
  const { t } = useTranslation();
  return (
    <div className="company">
      <dl className="focus-list">
        {FOCUS_AREAS.map(area => (
          <div key={area} className="focus-list__item">
            <dt className="focus-list__title">
              {t(`discover.company.focus.${area}.title`)}
            </dt>
            <dd className="focus-list__text">
              {t(`discover.company.focus.${area}.text`)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="button-row">
        <Link href={PATHS.contact} className="button button--primary">
          {t("discover.company.collaborate")}
        </Link>
        <Link
          href={PATHS.discover("dancers")}
          className="button button--outline"
        >
          {t("discover.company.meetDancers")}
        </Link>
      </div>
    </div>
  );
}
