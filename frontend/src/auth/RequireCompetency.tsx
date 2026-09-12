/**
 * Require Competency Route Guard
 *
 * Higher-order component that protects routes requiring a CBAC
 * competency. This is the frontend half of the gate the backend already
 * applies: every admin route carries `DEP_REQUIRE_MANAGE_USERS` at its
 * decorator, so the interface should ask the same question rather than a
 * rank that no longer decides anything.
 *
 * It deliberately does not ask *where*. A competency answers what someone
 * may do; membership answers where they may do it, and the backend scopes
 * each request on `platform_role` and the caller's organisations. A route
 * guard has no place to scope to, so it gates on the competency alone and
 * lets the API refuse anything out of scope — see
 * docs/docs/plans/2026-09-09-platform-role-plan.md.
 *
 * Works in conjunction with RequireAuth — assumes the user is authenticated.
 */

import { Center, Loader } from "@mantine/core";
import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useHasCompetency } from "@/lib/cbac/hooks";
import type { CompetencyId } from "@/types/cbac";
import { NotFoundLayout } from "@/components/layouts";

/**
 * RequireCompetency Props
 */
interface RequireCompetencyProps {
  /** Competency the user must hold (e.g. "manage_users") */
  competency: CompetencyId;
  /** Child components to render if the user holds it */
  children: ReactNode;
  /** Behaviour when they do not — 404 by default, hiding the route */
  fallback?: "redirect" | "404";
}

/**
 * Require Competency
 *
 * Gates content behind a CBAC competency.
 *
 * 404 is the default because it hides the route's existence from someone
 * who may not use it, matching `RequireFeature` and the backend's own
 * preference for 404 over 403 on place checks.
 *
 * @param props - Component props
 * @returns Protected content, a redirect, or 404
 *
 * @example
 * <RequireCompetency competency="manage_users">
 *   <Outlet />
 * </RequireCompetency>
 */
export default function RequireCompetency({
  competency,
  children,
  fallback = "404",
}: RequireCompetencyProps) {
  const { state } = useAuth();
  const holdsIt = useHasCompetency(competency);

  if (state.status === "loading") {
    return (
      <Center mih="60dvh">
        <Loader />
      </Center>
    );
  }

  // Defensive: RequireAuth should have caught this already.
  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (holdsIt) {
    return children;
  }

  if (fallback === "redirect") {
    return <Navigate to="/" replace />;
  }

  return <NotFoundLayout />;
}
