import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

export default function PageLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="site-frame">
      <a className="skip-link" href="#main-content">
        {t("nav.skipToContent")}
      </a>
      <SiteHeader />
      <main id="main-content" className="site-main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
