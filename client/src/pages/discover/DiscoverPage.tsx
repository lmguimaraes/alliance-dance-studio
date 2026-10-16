import { useTranslation } from "react-i18next";
import { Link, Redirect, useParams } from "wouter";
import PageHeader from "@/components/PageHeader";
import {
  DISCOVER_SECTIONS,
  isDiscoverSection,
  PATHS,
  type DiscoverSectionKey,
} from "@/lib/brand";
import { cx } from "@/lib/cx";
import { usePageMeta } from "@/lib/usePageMeta";
import AwardsSection from "./AwardsSection";
import CompanySection from "./CompanySection";
import GallerySection from "./GallerySection";
import ProfilesSection from "./ProfilesSection";
import StorySection from "./StorySection";
import "./discover.css";

function SectionContent({ section }: { section: DiscoverSectionKey }) {
  switch (section) {
    case "directors":
    case "dancers":
    case "teams":
      return <ProfilesSection section={section} />;
    case "awards":
      return <AwardsSection />;
    case "company":
      return <CompanySection />;
    case "story":
      return <StorySection />;
    case "gallery":
      return <GallerySection />;
  }
}

export default function DiscoverPage() {
  const { t } = useTranslation();
  const params = useParams<{ section: string }>();
  const section = params.section ?? "";
  const valid = isDiscoverSection(section);
  usePageMeta(
    valid ? t(`discover.sections.${section}.title`) : null,
    valid ? t(`discover.sections.${section}.intro`) : undefined
  );

  if (!valid) return <Redirect to={PATHS.discover()} replace />;

  return (
    <div className="discover">
      <nav className="container discover-nav" aria-label={t("nav.discover")}>
        <ul className="discover-nav__list" role="list">
          {DISCOVER_SECTIONS.map(item => (
            <li key={item}>
              <Link
                href={PATHS.discover(item)}
                className={cx(
                  "discover-nav__link",
                  item === section && "discover-nav__link--active"
                )}
                aria-current={item === section ? "page" : undefined}
              >
                {t(`discover.sections.${item}.label`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <PageHeader
        title={t(`discover.sections.${section}.title`)}
        intro={t(`discover.sections.${section}.intro`)}
      />
      <div className="container discover-section">
        <SectionContent section={section} />
      </div>
    </div>
  );
}
