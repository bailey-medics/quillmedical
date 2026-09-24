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

import { Component, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import ErrorState from "@/components/error-state/ErrorState";
import FeedbackModal from "@/components/feedback/FeedbackModal";
import { reportError } from "@lib/error-reporting/report";
import { fromError, sanitiseErrorReport } from "@lib/error-reporting/sanitise";
import {
  sendFeedback,
  type FeedbackErrorContext,
  type FeedbackInput,
} from "@lib/feedback/sendFeedback";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  /** The error caught, sanitised, for lining feedback up with its report */
  caught?: FeedbackErrorContext;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    const report = sanitiseErrorReport(
      fromError(error, __APP_VERSION__, "boundary"),
    );
    return {
      hasError: true,
      caught: { name: report.name, code: report.errorCode || undefined },
    };
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
      return (
        <ErrorFallback onReload={this.handleReload} error={this.state.caught} />
      );
    }
    return this.props.children;
  }
}

type FallbackProps = {
  onReload: () => void;
  /** The error caught, sent with any feedback so the two can be matched */
  error?: FeedbackErrorContext | undefined;
  /** Sends the feedback. Defaults to `sendFeedback`; stories pass a stub. */
  onSendFeedback?: (
    input: FeedbackInput,
    error?: FeedbackErrorContext,
  ) => Promise<unknown>;
};

/**
 * Exported for Storybook rendering.
 *
 * A thin wrapper over `ErrorState` in its page variant. A crash is the one
 * case where replacing the whole view is right — there is nothing left to
 * sit inside.
 *
 * Also offers `Tell us what happened`, opening the feedback modal. This is
 * the best moment to ask: the user has certainly hit a bug and is motivated
 * right now. The modal is rendered from here rather than from the sidebar,
 * and nothing on its send path needs the router, because the tree below
 * has already failed and nothing above it should be assumed to work.
 */
export function ErrorFallback({
  onReload,
  error,
  onSendFeedback = sendFeedback,
}: FallbackProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div data-testid="error-boundary-fallback">
      <ErrorState
        variant="page"
        message="An unexpected error occurred. Please try reloading the page."
        action={{ label: "Reload page", onClick: onReload }}
        secondaryAction={{
          label: "Tell us what happened",
          icon: "feedback",
          onClick: () => setFeedbackOpen(true),
        }}
      />
      <FeedbackModal
        opened={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={(input) => onSendFeedback(input, error)}
        showYourFeedbackLinks={false}
      />
    </div>
  );
}
