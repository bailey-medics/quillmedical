/**
 * UserAdminPage Component Tests
 *
 * Tests for the user admin page including:
 * - Loading states
 * - User details display
 * - CBAC settings display
 * - System permissions badge
 * - Error handling
 * - Action cards
 */

/* eslint-disable no-restricted-syntax */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import UserAdminPage from "./UserAdminPage";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import * as apiLib from "@/lib/api";

// Mock navigate function
const mockNavigate = vi.fn();

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock users with different permission levels
const mockAuthUsers: Record<string, User> = {
  admin: {
    id: "3",
    username: "admin.user",
    email: "admin@example.com",
    system_permissions: "admin",
  },
  superadmin: {
    id: "4",
    username: "superadmin.user",
    email: "superadmin@example.com",
    system_permissions: "superadmin",
  },
};

// Mock user details from API
const mockUserDetails = {
  id: 1,
  username: "test.user",
  email: "test@example.com",
  name: "test.user",
  base_profession: "doctor",
  additional_competencies: ["cardiology", "surgery"],
  removed_competencies: ["dermatology"],
  system_permissions: "staff" as const,
};

describe("UserAdminPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();

    // Mock auth context to return admin user
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: {
        status: "authenticated",
        user: mockAuthUsers.admin,
      },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });
  });

  describe("Loading state", () => {
    it("shows loading skeletons while fetching user data", async () => {
      vi.spyOn(apiLib.api, "get").mockImplementation(
        () => new Promise(() => {}),
      );

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      // Wait for component to render
      await waitFor(() => {
        // Check for skeleton loaders using the correct class
        const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
        expect(skeletons.length).toBeGreaterThan(0);
      });
    });
  });

  describe("User details display", () => {
    it("displays user username", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("test.user")).toBeInTheDocument();
      });
    });

    it("displays user email", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("test@example.com")).toBeInTheDocument();
      });
    });

    it("displays user ID", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("1")).toBeInTheDocument();
      });
    });
  });

  describe("System permissions badge", () => {
    it("displays STAFF badge for staff users", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        ...mockUserDetails,
        system_permissions: "staff",
      });

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("STAFF")).toBeInTheDocument();
      });
    });

    it("displays ADMIN badge for admin users", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        ...mockUserDetails,
        system_permissions: "admin",
      });

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("ADMIN")).toBeInTheDocument();
      });
    });

    it("displays SUPERADMIN badge for superadmin users", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        ...mockUserDetails,
        system_permissions: "superadmin",
      });

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
      });
    });
  });

  describe("CBAC settings display", () => {
    it("displays base profession", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("doctor")).toBeInTheDocument();
      });
    });

    it("displays 'Not set' when base profession is null", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        ...mockUserDetails,
        base_profession: null,
      });

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Not set")).toBeInTheDocument();
      });
    });

    it("displays additional competencies as badges", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("cardiology")).toBeInTheDocument();
        expect(screen.getByText("surgery")).toBeInTheDocument();
      });
    });

    it("displays removed competencies as badges", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("dermatology")).toBeInTheDocument();
      });
    });

    it("displays message when no CBAC settings configured", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        ...mockUserDetails,
        base_profession: null,
        additional_competencies: [],
        removed_competencies: [],
      });

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(
          screen.getByText("No CBAC settings configured"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Action cards", () => {
    it("displays edit user action card", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Edit user")).toBeInTheDocument();
      });
    });

    it("displays update permissions action card", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Update permissions")).toBeInTheDocument();
      });
    });

    it("displays deactivate user action card", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockUserDetails);

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Deactivate user")).toBeInTheDocument();
      });
    });
  });

  describe("Error handling", () => {
    it("displays error message when user fetch fails", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(
        new Error("Failed to fetch user"),
      );

      renderWithRouter(<UserAdminPage />, {
        routePath: "/admin/users/:id",
        initialRoute: "/admin/users/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Error loading user")).toBeInTheDocument();
        expect(screen.getByText("Failed to fetch user")).toBeInTheDocument();
      });
    });
  });
});
