import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { BRAND, PATHS } from "@/lib/brand";
import { cx } from "@/lib/cx";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/usePageMeta";
import AdminLogin from "./AdminLogin";
import BookingsPanel from "./BookingsPanel";
import ClassesPanel from "./ClassesPanel";
import DiscoverPanel from "./DiscoverPanel";
import PassesPanel from "./PassesPanel";
import StudiosPanel from "./StudiosPanel";
import "./admin.css";

const TABS = ["bookings", "classes", "passes", "discover", "studios"] as const;
type Tab = (typeof TABS)[number];

function tabFromHash(): Tab {
  const hash = window.location.hash.slice(1);
  return (TABS as readonly string[]).includes(hash)
    ? (hash as Tab)
    : "bookings";
}

export default function AdminPage() {
  const { t } = useTranslation();
  usePageMeta(t("admin.title"));
  const utils = trpc.useUtils();
  const session = trpc.admin.session.useQuery(undefined, { staleTime: 0 });
  const logout = trpc.admin.logout.useMutation({
    onSettled: () => {
      utils.admin.invalidate();
    },
  });
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    window.history.replaceState(window.history.state, "", `#${tab}`);
  }, [tab]);

  const onUnauthorized = () => void utils.admin.session.invalidate();

  if (session.isLoading) {
    return (
      <div className="admin admin--centered">
        <Loader2 className="spinner" aria-label={t("common.loading")} />
      </div>
    );
  }

  if (!session.data?.authenticated) {
    return (
      <AdminLogin onSuccess={() => void utils.admin.session.invalidate()} />
    );
  }

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="admin-bar__brand">
          <img
            src={BRAND.logos.large}
            alt={BRAND.name}
            width={71}
            height={35}
          />
          <span>{t("admin.title")}</span>
        </div>
        <div className="admin-bar__tools">
          <LanguageSwitcher />
          <Link
            href={PATHS.home}
            className="button button--quiet button--small"
          >
            {t("admin.viewSite")}
          </Link>
          <button
            type="button"
            className="button button--outline button--small"
            onClick={() => logout.mutate()}
          >
            {t("admin.signOut")}
          </button>
        </div>
      </header>

      {session.data.usingDefaultPassword && (
        <p className="notice notice--error admin__warning" role="status">
          {t("admin.defaultPassword")}
        </p>
      )}

      <nav className="admin-tabs" aria-label={t("admin.title")}>
        {TABS.map(item => (
          <button
            key={item}
            type="button"
            className={cx(
              "admin-tabs__tab",
              item === tab && "admin-tabs__tab--active"
            )}
            aria-current={item === tab ? "page" : undefined}
            onClick={() => setTab(item)}
          >
            {t(`admin.tabs.${item}`)}
          </button>
        ))}
      </nav>

      <main className="admin__content">
        {tab === "bookings" && (
          <BookingsPanel onUnauthorized={onUnauthorized} />
        )}
        {tab === "classes" && <ClassesPanel onUnauthorized={onUnauthorized} />}
        {tab === "passes" && <PassesPanel onUnauthorized={onUnauthorized} />}
        {tab === "discover" && (
          <DiscoverPanel onUnauthorized={onUnauthorized} />
        )}
        {tab === "studios" && <StudiosPanel onUnauthorized={onUnauthorized} />}
      </main>
    </div>
  );
}
