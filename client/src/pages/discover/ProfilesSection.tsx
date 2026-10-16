import { useTranslation } from "react-i18next";
import { Instagram, Link2 } from "lucide-react";
import { currentLanguage, localized } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  DiscoverEmpty,
  DiscoverError,
  DiscoverLoading,
} from "./DiscoverStates";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ProfilesSection({
  section,
}: {
  section: "directors" | "dancers" | "teams";
}) {
  const { t, i18n } = useTranslation();
  const language = currentLanguage(i18n.resolvedLanguage ?? i18n.language);
  const query = trpc.site.discover.useQuery({ section });

  if (query.isLoading) return <DiscoverLoading />;
  if (query.error)
    return <DiscoverError onRetry={() => void query.refetch()} />;
  const entries = query.data ?? [];
  if (!entries.length)
    return <DiscoverEmpty message={t(`discover.sections.${section}.empty`)} />;

  return (
    <ul className="profile-grid" role="list">
      {entries.map(entry => {
        const role = localized(language, {
          en: entry.subtitleEn,
          fr: entry.subtitleFr,
          es: entry.subtitleEs,
        });
        const bio = localized(language, {
          en: entry.bodyEn,
          fr: entry.bodyFr,
          es: entry.bodyEs,
        });
        const isInstagram = entry.linkUrl?.includes("instagram.com");
        return (
          <li key={entry.id} className="profile-card">
            <div className="profile-card__portrait">
              {entry.imageUrl ? (
                <img
                  src={entry.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="profile-card__initials" aria-hidden="true">
                  {initials(entry.name)}
                </span>
              )}
            </div>
            <h2 className="profile-card__name">{entry.name}</h2>
            {role && <p className="profile-card__role">{role}</p>}
            {bio && <p className="profile-card__bio">{bio}</p>}
            {entry.linkUrl && (
              <a
                className="profile-card__link"
                href={entry.linkUrl}
                target="_blank"
                rel="noreferrer"
              >
                {isInstagram ? (
                  <Instagram aria-hidden="true" />
                ) : (
                  <Link2 aria-hidden="true" />
                )}
                {isInstagram
                  ? t("discover.profile.instagram")
                  : t("discover.profile.website")}
                <span className="visually-hidden">{entry.name}</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
