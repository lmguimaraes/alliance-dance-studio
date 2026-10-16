import { useTranslation } from "react-i18next";
import { Instagram } from "lucide-react";
import { BRAND } from "@/lib/brand";

export function DiscoverLoading() {
  return (
    <div className="discover-loading" aria-busy="true">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

export function DiscoverError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="notice notice--error" role="alert">
      <strong>{t("errors.loadTitle")}</strong>
      {t("errors.loadBody")}{" "}
      <button type="button" className="button button--quiet" onClick={onRetry}>
        {t("common.retry")}
      </button>
    </div>
  );
}

/** Shown while a section has no published content yet. */
export function DiscoverEmpty({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <p>{message}</p>
      <a
        className="button button--outline"
        href={BRAND.instagramUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Instagram aria-hidden="true" />
        {t("discover.followInstagram", { handle: BRAND.instagramHandle })}
      </a>
    </div>
  );
}
