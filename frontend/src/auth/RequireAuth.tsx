/**
 * Require Authentication Route Guard
 *
 * Higher-order component that protects routes requiring authentication.
 * Redirects unauthenticated users to login page and shows loading state
 * while authentication is being checked.
 */

import { Center, Loader } from "@mantine/core";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { ReactNode } from "react";

/**
 * RequireAuth
 *
 * Route protection component that ensures user is authenticated before
 * rendering child routes. Shows loading spinner during auth check and
 * redirects to /login if user is not authenticated.
 *
 * Preserves the intended destination in location state so users can be
 * redirected back after successful login.
 *
 * @param children - Protected route components to render when authenticated
 *
 * @example
 * <Route path="/dashboard" element={
 *   <RequireAuth>
 *     <Dashboard />
 *   </RequireAuth>
 * } />
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <Center mih="60dvh">
        <Loader />
      </Center>
    );
  }

  if (state.status === "unauthenticated") {
    // Only preserve the intended destination when the user was kicked out
    // by session expiry / token failure — NOT after an explicit logout.
    // Passing the previous path after logout leaks PHI: the next person
    // to log in on this tab would be redirected to whatever page the
    // previous user was viewing.
    const from = state.loggedOut ? undefined : { from: location };
    return <Navigate to="/login" replace state={from} />;
  }

  return children;
}
