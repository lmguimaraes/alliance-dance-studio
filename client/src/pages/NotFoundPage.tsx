import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import { PATHS } from "@/lib/brand";
import { usePageMeta } from "@/lib/usePageMeta";

export default function NotFoundPage() {
  const { t } = useTranslation();
  usePageMeta(t("notFound.title"));

  return (
    <PageHeader
      title={t("notFound.title")}
      intro={t("notFound.body")}
      actions={
        <>
          <Link href={PATHS.home} className="button button--primary">
            {t("notFound.home")}
          </Link>
          <Link href={PATHS.contact} className="button button--outline">
            {t("nav.contact")}
          </Link>
        </>
      }
    />
  );
}
