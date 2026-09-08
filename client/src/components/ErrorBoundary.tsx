import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("Unhandled client error", error, info.componentStack);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <section className="w-full max-w-md rounded-[2rem] border border-border bg-card p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-5 text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Reload the page and try again. No technical error details are shown
            here.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reload page
          </button>
        </section>
      </main>
    );
  }
}
