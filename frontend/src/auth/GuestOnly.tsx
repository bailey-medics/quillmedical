/**
 * Guest-Only Route Guard
 *
 * Higher-order component that protects routes intended only for unauthenticated
 * users (e.g., login, registration). Redirects authenticated users to the
 * application home page.
 */

import { useEffect, type ReactNode } from "react";
import { PageSpinner } from "@/components/loading-spinner";
import { useAuth } from "./AuthContext";

/**
 * GuestOnly
 *
 * Route protection component that ensures only unauthenticated users can
 * access child routes. Redirects authenticated users to the application
 * home page.
 *
 * Used for login and registration pages to prevent authenticated users from
 * accessing them. Performs full navigation (window.location.assign) to ensure
 * proper base URL handling with trailing slash.
 *
 * @param children - Guest-only route components (login, register)
 *
 * @example
 * <Route path="/login" element={
 *   <GuestOnly>
 *     <LoginPage />
 *   </GuestOnly>
 * } />
 */
export default function GuestOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  useEffect(() => {
    if (state.status === "authenticated") {
      // Perform a full navigation to BASE_URL so we land on the exact
      // path including trailing slash. This avoids the router producing
      // URLs without the trailing slash.
      const rawBase = import.meta.env.BASE_URL || "/";
      const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
      window.location.assign(base);
    }
  }, [state.status]);

  // The same spinner the page showed while it loaded, in the same place,
  // so asking who is signed in reads as the end of one wait. It used to
  // be a blank page, straight before the sign-in screen.
  if (state.status === "loading") return <PageSpinner />;
  if (state.status === "authenticated") return null; // effect will redirect
  return children;
}
