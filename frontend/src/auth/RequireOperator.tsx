/**
 * Require Operator Route Guard
 *
 * Higher-order component that protects routes only a Quill operator may
 * reach. It asks `platform_role`, which is true everywhere or nowhere —
 * operating Quill has nothing to do with any organisation or site.
 *
 * This replaces `RequirePermission`, which took a `level` and compared it
 * against a four-rung hierarchy of `system_permissions`. Three of those
 * rungs described a person at a *org_unit* and moved to membership and
 * competencies; by the end only `superadmin` was ever passed, so the
 * hierarchy, its `single-user` fallback branch and the prop itself were
 * unreachable code referring to a retiring column. See
 * docs/docs/plans/2026-09-09-platform-role-plan.md.
 *
 * Administering an org_unit is not this question — that is the `manage_users`
 * competency, guarded by `RequireCompetency` beside this.
 *
 * Works in conjunction with RequireAuth — assumes the user is authenticated.
 */

import { Center, Loader } from "@mantine/core";
import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { NotFoundLayout } from "@/components/layouts";

/**
 * RequireOperator Props
 */
interface RequireOperatorProps {
  /** Child components to render if the user operates Quill */
  children: ReactNode;
  /** Behaviour when they do not — 404 by default, hiding the route */
  fallback?: "redirect" | "404";
}

/**
 * Require Operator
 *
 * Gates content behind `platform_role === "superadmin"`.
 *
 * 404 is the default because it hides the route's existence from someone
 * who may not use it, matching `RequireCompetency` and the backend's own
 * preference for 404 over 403 on org_unit checks.
 *
 * @param props - Component props
 * @returns Protected content, a redirect, or 404
 *
 * @example
 * <RequireOperator>
 *   <CreateOrganisationPage />
 * </RequireOperator>
 */
export default function RequireOperator({
  children,
  fallback = "404",
}: RequireOperatorProps) {
  const { state } = useAuth();

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

  if (state.user.platform_role === "superadmin") {
    return children;
  }

  if (fallback === "redirect") {
    return <Navigate to="/" replace />;
  }

  return <NotFoundLayout />;
}
