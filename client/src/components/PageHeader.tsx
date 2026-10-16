import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function PageHeader({
  title,
  intro,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={["page-header", "container", className]
        .filter(Boolean)
        .join(" ")}
    >
      <h1 className="display-title page-header__title">{title}</h1>
      {intro && <p className="lead page-header__intro">{intro}</p>}
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
