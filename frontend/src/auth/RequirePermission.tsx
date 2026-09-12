/**
 * Require Permission Route Guard
 *
 * Higher-order component that protects routes requiring specific permission levels.
 * Provides tiered security approach:
 * - Single-user accounts: 404 (hide feature existence)
 * - Anyone else lacking the level: 404 by default, redirect if asked
 *
 * Administering a place is no longer a level here — it is the
 * `manage_users` competency, guarded by `RequireCompetency`.
 *
 * `level="superadmin"` is not part of that hierarchy: it asks the
 * separate `platform_role` field, because operating Quill itself is
 * true everywhere or nowhere rather than at a place.
 *
 * Works in conjunction with RequireAuth - assumes user is already authenticated.
 */

import { Center, Loader } from "@mantine/core";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { ReactNode } from "react";
import type { SystemPermission } from "@/types/cbac";
import { NotFoundLayout } from "@/components/layouts";

/**
 * Permission hierarchy levels
 */
const PERMISSION_HIERARCHY: Record<SystemPermission, number> = {
  "single-user": 0,
  staff: 1,
  admin: 2,
  superadmin: 3,
};

/**
 * RequirePermission Props
 */
interface RequirePermissionProps {
  /**
   * Minimum permission level required.
   *
   * `admin` is gone: administering a place is a competency, so those
   * routes use `RequireCompetency` instead. `staff` remains until it
   * becomes membership, and `superadmin` reads `platform_role`.
   */
  level: "staff" | "superadmin";
  /** Child components to render if authorized */
  children: ReactNode;
  /** Fallback behavior for unauthorized access */
  fallback?: "redirect" | "404";
}

/**
 * Require Permission
 *
 * Route protection component that ensures user has required permission level.
 * Implements defense-in-depth security pattern:
 *
 * Security Strategy:
 * - Patient users: Always 404 for admin routes (hide existence)
 * - Staff users: 404 for admin routes by default, redirect if specified
 * - Backend: Always validates permissions (never trust frontend alone)
 *
 * @param props - Component props
 * @returns Protected content, redirect, or 404 based on permissions
 *
 * @example
 * // Require admin access, show 404 to patients, redirect staff
 * <RequirePermission level="admin">
 *   <PatientAdminPage />
 * </RequirePermission>
 *
 * @example
 * // Require staff access, redirect anyone without access
 * <RequirePermission level="staff" fallback="redirect">
 *   <ClinicalDashboard />
 * </RequirePermission>
 */
export default function RequirePermission({
  level,
  children,
  fallback = "404",
}: RequirePermissionProps) {
  const { state } = useAuth();

  // Still loading auth state
  if (state.status === "loading") {
    return (
      <Center mih="60dvh">
        <Loader />
      </Center>
    );
  }

  // Not authenticated (shouldn't happen if wrapped in RequireAuth, but defensive)
  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  const userPermission = state.user.system_permissions as SystemPermission;

  // "Operates Quill itself" now lives in its own column, so the
  // superadmin guard asks `platform_role` rather than the top rung of
  // the hierarchy. The other levels describe a person at a *place* and
  // still read `system_permissions` until they become competency
  // checks — see docs/docs/plans/2026-09-09-platform-role-plan.md.
  if (level === "superadmin") {
    if (state.user.platform_role === "superadmin") {
      return children;
    }
    return unauthorised(userPermission, fallback);
  }

  const userLevel = PERMISSION_HIERARCHY[userPermission];
  const requiredLevel = PERMISSION_HIERARCHY[level];

  // User has sufficient permissions
  if (userLevel >= requiredLevel) {
    return children;
  }

  return unauthorised(userPermission, fallback);
}

/**
 * Unauthorised access handling with the tiered approach: single-user
 * accounts always get a 404 so admin features stay hidden, everyone
 * else gets the caller's chosen fallback.
 */
function unauthorised(
  userPermission: SystemPermission,
  fallback: "redirect" | "404",
) {
  // Single-user accounts always get 404 to hide admin features
  if (userPermission === "single-user") {
    return <NotFoundLayout />;
  }

  // Staff and others: use specified fallback
  if (fallback === "404") {
    return <NotFoundLayout />;
  }

  // Redirect fallback
  return <Navigate to="/" replace />;
}
