import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "@/i18n/config";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV)
      console.error("Unhandled client error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="container page-header">
        <h1 className="display-title">{i18n.t("errors.crashTitle")}</h1>
        <p className="lead page-header__intro">{i18n.t("errors.crashBody")}</p>
        <div className="page-header__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            {i18n.t("errors.reload")}
          </button>
        </div>
      </main>
    );
  }
}
