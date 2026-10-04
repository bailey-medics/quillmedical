/**
 * Route error fallback
 *
 * What the router shows when a route fails before it can render: above
 * all a lazy chunk that could not be fetched. `ErrorBoundary` cannot catch
 * that. The router catches a rejected `lazy` itself and renders the
 * nearest route's `errorElement`, and with none set it shows its own
 * developer screen ("Unexpected Application Error!"), in production too.
 *
 * Set as the `errorElement` of the root route in `main.tsx`, so every tree
 * inherits it. It shows the same fallback as `ErrorBoundary`, and reports
 * the error the same way.
 */

import { useEffect, useMemo } from "react";
import { useRouteError } from "react-router-dom";
import { reportError } from "@lib/error-reporting/report";
import { fromError, sanitiseErrorReport } from "@lib/error-reporting/sanitise";
import type { FeedbackErrorContext } from "@lib/feedback/sendFeedback";
import { ErrorFallback } from "./ErrorBoundary";

function reloadPage(): void {
  window.location.reload();
}

export default function RouteErrorFallback() {
  const error = useRouteError();

  useEffect(() => {
    console.error("Route error:", error);
    reportError(error, "boundary");
  }, [error]);

  const caught = useMemo((): FeedbackErrorContext => {
    const report = sanitiseErrorReport(
      fromError(error, __APP_VERSION__, "boundary"),
    );
    return { name: report.name, code: report.errorCode || undefined };
  }, [error]);

  return <ErrorFallback onReload={reloadPage} error={caught} />;
}
