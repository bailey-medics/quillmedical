/**
 * RequirePermission Component Tests
 *
 * Tests for permission-based route protection including:
 * - Permission level enforcement
 * - Tiered security responses (404 vs redirect)
 * - Loading and unauthenticated states
 * - Permission hierarchy verification
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import RequirePermission from "./RequirePermission";
import * as authContext from "./AuthContext";
import type { User } from "./AuthContext";

// Mock users with different permission levels
const mockUsers: Record<string, User> = {
  singleUser: {
    id: "1",
    username: "single.user",
    email: "user@example.com",
    system_permissions: "single-user",
  },
  staff: {
    id: "2",
    username: "staff.user",
    email: "staff@example.com",
    system_permissions: "staff",
  },
  admin: {
    id: "3",
    username: "admin.user",
    email: "admin@example.com",
    system_permissions: "admin",
    platform_role: "standard",
  },
  superadmin: {
    id: "4",
    username: "superadmin.user",
    email: "superadmin@example.com",
    system_permissions: "superadmin",
    platform_role: "superadmin",
  },
  // Says superadmin in the old column and not in the new one. The
  // superadmin guard must believe the new one.
  staleSuperadmin: {
    id: "5",
    username: "stale.superadmin",
    email: "stale@example.com",
    system_permissions: "superadmin",
    platform_role: "standard",
  },
};

describe("RequirePermission", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Loading and unauthenticated states", () => {
    it("shows loader when auth state is loading", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: { status: "loading", user: null },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff">
          <div>Protected Content</div>
        </RequirePermission>,
      );

      expect(
        document.querySelector(".mantine-Loader-root"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });

    it("redirects to login when unauthenticated", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: { status: "unauthenticated", user: null },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff">
          <div>Protected Content</div>
        </RequirePermission>,
        { initialRoute: "/admin/patients" },
      );

      expect(window.location.pathname).toBe("/login");
    });
  });

  describe("Staff level protection", () => {
    it("allows staff users to access staff-protected routes", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.staff,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff">
          <div>Staff Content</div>
        </RequirePermission>,
      );

      expect(screen.getByText("Staff Content")).toBeInTheDocument();
    });

    it("allows admin users to access staff-protected routes", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.admin,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff">
          <div>Staff Content</div>
        </RequirePermission>,
      );

      expect(screen.getByText("Staff Content")).toBeInTheDocument();
    });

    it("shows 404 to single-user accounts trying to access staff routes", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.singleUser,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff">
          <div>Staff Content</div>
        </RequirePermission>,
      );

      expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
      expect(screen.queryByText("Staff Content")).not.toBeInTheDocument();
    });
  });

  describe("Superadmin level protection", () => {
    it("allows only superadmin users to access superadmin-protected routes", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.superadmin,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="superadmin">
          <div>Superadmin Content</div>
        </RequirePermission>,
      );

      expect(screen.getByText("Superadmin Content")).toBeInTheDocument();
    });

    it("refuses a user whose platform_role is not superadmin", () => {
      // The guard reads platform_role, not the old top rung, so a user
      // still marked superadmin in system_permissions is refused.
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.staleSuperadmin,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="superadmin">
          <div>Superadmin Content</div>
        </RequirePermission>,
      );

      expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
      expect(screen.queryByText("Superadmin Content")).not.toBeInTheDocument();
    });

    it("shows 404 to admin users trying to access superadmin routes", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.admin,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="superadmin">
          <div>Superadmin Content</div>
        </RequirePermission>,
      );

      expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
      expect(screen.queryByText("Superadmin Content")).not.toBeInTheDocument();
    });
  });

  describe("Fallback behavior", () => {
    it("uses 404 fallback by default", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.singleUser,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff">
          <div>Admin Content</div>
        </RequirePermission>,
      );

      expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
    });

    it("respects explicit 404 fallback", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.singleUser,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff" fallback="404">
          <div>Admin Content</div>
        </RequirePermission>,
      );

      expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
    });

    it("still shows 404 to a single-user asking for the redirect fallback", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.singleUser,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff" fallback="redirect">
          <div>Admin Content</div>
        </RequirePermission>,
        { initialRoute: "/admin/settings" },
      );

      // `single-user` is the only remaining level below `staff`, and it
      // always gets 404 — so `fallback="redirect"` is now unreachable
      // for `level="staff"`. It stays supported for `superadmin`.
      expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
    });

    it("always shows 404 to single-user accounts regardless of fallback setting", () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.singleUser,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      renderWithRouter(
        <RequirePermission level="staff" fallback="redirect">
          <div>Admin Content</div>
        </RequirePermission>,
      );

      // Patients should always get 404, not redirect
      expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
      expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
    });
  });
});
