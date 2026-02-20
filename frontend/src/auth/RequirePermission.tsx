/**
 * Require Permission Route Guard
 *
 * Higher-order component that protects routes requiring specific permission levels.
 * Provides tiered security approach:
 * - Patients accessing admin routes: 404 (hide feature existence)
 * - Staff accessing admin-only routes: Redirect to home (inform but redirect)
 * - Admin/superadmin: Allow access
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
  patient: 0,
  staff: 1,
  admin: 2,
  superadmin: 3,
};

/**
 * RequirePermission Props
 */
interface RequirePermissionProps {
  /** Minimum permission level required */
  level: "staff" | "admin" | "superadmin";
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
  const userLevel = PERMISSION_HIERARCHY[userPermission];
  const requiredLevel = PERMISSION_HIERARCHY[level];

  // User has sufficient permissions
  if (userLevel >= requiredLevel) {
    return children;
  }

  // Unauthorized access handling with tiered approach
  // Patients always get 404 to hide admin features
  if (userPermission === "patient") {
    return <NotFoundLayout />;
  }

  // Staff and others: use specified fallback
  if (fallback === "404") {
    return <NotFoundLayout />;
  }

  // Redirect fallback
  return <Navigate to="/" replace />;
}
