/**
 * Require Clinical Services Route Guard
 *
 * Protects routes that depend on clinical services (FHIR/EHRbase).
 * Redirects to /teaching when clinical services are disabled, assuming
 * the user is already authenticated (used inside RequireAuth).
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { ReactNode } from "react";

export default function RequireClinical({ children }: { children: ReactNode }) {
  const { state } = useAuth();

  if (
    state.status === "authenticated" &&
    state.user.clinical_services_enabled === false
  ) {
    return <Navigate to="/teaching" replace />;
  }

  return children;
}
