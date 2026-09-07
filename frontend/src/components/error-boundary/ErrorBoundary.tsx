/**
 * Error Boundary Component
 *
 * Catches unhandled React errors and displays a friendly fallback UI
 * instead of crashing the entire application to a white screen.
 *
 * Reports the error as well as logging it. The console line stays because it
 * is what a developer with the tools open actually reads; the report is what
 * reaches somebody who is not watching. Only this boundary has React's
 * component stack, which says which part of the interface failed in a way the
 * JavaScript frames do not.
 */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import ErrorState from "@/components/error-state/ErrorState";
import { reportError } from "@lib/error-reporting/report";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
    reportError(error, "boundary", {
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}

type FallbackProps = {
  onReload: () => void;
};

/**
 * Exported for Storybook rendering.
 *
 * A thin wrapper over `ErrorState` in its page variant. A crash is the one
 * case where replacing the whole view is right — there is nothing left to
 * sit inside.
 */
export function ErrorFallback({ onReload }: FallbackProps) {
  return (
    <div data-testid="error-boundary-fallback">
      <ErrorState
        variant="page"
        message="An unexpected error occurred. Please try reloading the page."
        action={{ label: "Reload page", onClick: onReload }}
      />
    </div>
  );
}
