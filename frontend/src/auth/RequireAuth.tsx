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
import type { ReactNode } from "@tabler/icons-react";

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
      <Center mih="60vh">
        <Loader />
      </Center>
    );
  }

  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
