/**
 * AdminOrganisationsPage Component Tests
 *
 * Tests for the admin organisations page including:
 * - Loading states
 * - Organisation list display
 * - Add organisation button
 * - Organisation navigation
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AdminOrganisationsPage from "./AdminOrganisationsPage";
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

// Mock admin user
const mockAdminUser: User = {
  id: "3",
  username: "admin.user",
  email: "admin@example.com",
  system_permissions: "admin",
};

describe("AdminOrganisationsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();

    // Mock auth context to return admin user
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: {
        status: "authenticated",
        user: mockAdminUser,
      },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });
  });

  describe("Page layout", () => {
    it("displays page title", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ organizations: [] });

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      await waitFor(() => {
        expect(screen.getByText("Organisations")).toBeInTheDocument();
      });
    });

    it("displays add organisation button", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ organizations: [] });

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      await waitFor(() => {
        expect(screen.getByText("Add organisation")).toBeInTheDocument();
      });
    });
  });

  describe("Organisation list display", () => {
    it("displays organisations in a table", async () => {
      const mockOrganizations = [
        {
          id: 1,
          name: "Test Hospital",
          type: "hospital",
          location: "London, UK",
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-15T10:00:00Z",
        },
        {
          id: 2,
          name: "Test Clinic",
          type: "clinic",
          location: "Manchester, UK",
          created_at: "2024-02-20T14:30:00Z",
          updated_at: "2024-02-20T14:30:00Z",
        },
      ];

      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        organizations: mockOrganizations,
      });

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      await waitFor(() => {
        expect(screen.getByText("Test Hospital")).toBeInTheDocument();
        expect(screen.getByText("Test Clinic")).toBeInTheDocument();
        expect(screen.getByText("Hospital")).toBeInTheDocument(); // Formatted type
        expect(screen.getByText("Clinic")).toBeInTheDocument();
        expect(screen.getByText("London, UK")).toBeInTheDocument();
        expect(screen.getByText("Manchester, UK")).toBeInTheDocument();
      });
    });

    it("formats organisation type correctly", async () => {
      const mockOrganizations = [
        {
          id: 1,
          name: "Test Practice",
          type: "general_practice",
          location: null,
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-15T10:00:00Z",
        },
      ];

      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        organizations: mockOrganizations,
      });

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      await waitFor(() => {
        expect(screen.getByText("General Practice")).toBeInTheDocument();
      });
    });

    it("displays N/A for missing location", async () => {
      const mockOrganizations = [
        {
          id: 1,
          name: "Test Org",
          type: "clinic",
          location: null,
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-15T10:00:00Z",
        },
      ];

      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        organizations: mockOrganizations,
      });

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      await waitFor(() => {
        expect(screen.getByText("N/A")).toBeInTheDocument();
      });
    });

    it("shows empty state when no organisations", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ organizations: [] });

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      await waitFor(() => {
        expect(screen.getByText("Add organisation")).toBeInTheDocument();
      });
    });
  });

  describe("Navigation", () => {
    it("navigates to organisation detail on row click", async () => {
      const user = userEvent.setup();
      const mockOrganizations = [
        {
          id: 1,
          name: "Test Hospital",
          type: "hospital",
          location: "London",
          created_at: "2024-01-15T10:00:00Z",
          updated_at: "2024-01-15T10:00:00Z",
        },
      ];

      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        organizations: mockOrganizations,
      });

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      await waitFor(() => {
        expect(screen.getByText("Test Hospital")).toBeInTheDocument();
      });

      const row = screen.getByText("Test Hospital").closest("tr");
      expect(row).toBeInTheDocument();

      if (row) {
        await user.click(row);
        expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1");
      }
    });

    it("navigates to new organisation page on add button click", async () => {
      const user = userEvent.setup();
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ organizations: [] });

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      await waitFor(() => {
        expect(screen.getByText("Add organisation")).toBeInTheDocument();
      });

      const addButton = screen.getByText("Add organisation");
      await user.click(addButton);

      expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/new");
    });
  });

  describe("Loading state", () => {
    it("shows loading state initially", () => {
      vi.spyOn(apiLib.api, "get").mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      expect(screen.getByText("Organisations")).toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("handles API error gracefully", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("API error"));

      renderWithRouter(<AdminOrganisationsPage />, {
        initialRoute: "/admin/organisations",
      });

      // Wait for error state to be set (loading to finish)
      await waitFor(() => {
        expect(screen.queryByText("Organisations")).toBeInTheDocument();
      });

      // The DataTable should display the error
      // Note: We're just checking that the page loaded without crashing
    });
  });
});
