import { useTranslation } from "react-i18next";
import { currentLanguage, localized } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  DiscoverEmpty,
  DiscoverError,
  DiscoverLoading,
} from "./DiscoverStates";

export default function AwardsSection() {
  const { t, i18n } = useTranslation();
  const language = currentLanguage(i18n.resolvedLanguage ?? i18n.language);
  const query = trpc.site.discover.useQuery({ section: "awards" });

  if (query.isLoading) return <DiscoverLoading />;
  if (query.error)
    return <DiscoverError onRetry={() => void query.refetch()} />;
  const awards = query.data ?? [];
  if (!awards.length)
    return <DiscoverEmpty message={t("discover.sections.awards.empty")} />;

  return (
    <ol className="awards-list" role="list">
      {awards.map(award => {
        const result = localized(language, {
          en: award.subtitleEn,
          fr: award.subtitleFr,
          es: award.subtitleEs,
        });
        const detail = localized(language, {
          en: award.bodyEn,
          fr: award.bodyFr,
          es: award.bodyEs,
        });
        return (
          <li key={award.id} className="award-row">
            <span className="award-row__year tabular">{award.year ?? ""}</span>
            <div className="award-row__body">
              <h2 className="award-row__title">
                {award.linkUrl ? (
                  <a href={award.linkUrl} target="_blank" rel="noreferrer">
                    {award.name}
                  </a>
                ) : (
                  award.name
                )}
              </h2>
              {result && <p className="award-row__result">{result}</p>}
              {detail && <p className="award-row__detail">{detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
