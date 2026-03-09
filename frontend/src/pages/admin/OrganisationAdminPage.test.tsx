/**
 * OrganisationAdminPage Component Tests
 *
 * Tests for the organisation admin page including:
 * - Loading states
 * - Organisation details display
 * - Staff members list
 * - Statistics display
 * - Action cards
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import OrganisationAdminPage from "./OrganisationAdminPage";
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

describe("OrganisationAdminPage", () => {
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

  describe("Organisation details display", () => {
    it("displays organisation name", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London, UK",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Test Hospital")).toBeInTheDocument();
      });
    });

    it("displays organisation type", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Clinic",
        type: "clinic",
        location: "Manchester",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("clinic")).toBeInTheDocument();
      });
    });

    it("displays organisation location", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Practice",
        type: "general_practice",
        location: "Birmingham, UK",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Birmingham, UK")).toBeInTheDocument();
      });
    });

    it("displays N/A when location is null", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Org",
        type: "clinic",
        location: null,
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("N/A")).toBeInTheDocument();
      });
    });
  });

  describe("Statistics display", () => {
    it("displays staff count", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [
          { id: "1", username: "doctor1", email: "doctor1@test.com" },
          { id: "2", username: "doctor2", email: "doctor2@test.com" },
        ],
        patient_count: 5,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("2")).toBeInTheDocument(); // Staff count
      });
    });

    it("displays patient count", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Clinic",
        type: "clinic",
        location: "Manchester",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 15,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("15")).toBeInTheDocument(); // Patient count
      });
    });
  });

  describe("Staff members list", () => {
    it("displays staff members in table", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [
          { id: "1", username: "doctor1", email: "doctor1@test.com" },
          { id: "2", username: "nurse1", email: "nurse1@test.com" },
        ],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("doctor1")).toBeInTheDocument();
        expect(screen.getByText("nurse1")).toBeInTheDocument();
        expect(screen.getByText("doctor1@test.com")).toBeInTheDocument();
        expect(screen.getByText("nurse1@test.com")).toBeInTheDocument();
      });
    });

    it("shows message when no staff members", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Clinic",
        type: "clinic",
        location: "Manchester",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Staff members")).toBeInTheDocument();
      });
    });
  });

  describe("Action cards", () => {
    it("displays edit action card", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Edit organisation")).toBeInTheDocument();
      });
    });

    it("displays manage staff action card", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Manage staff")).toBeInTheDocument();
      });
    });

    it("navigates to edit page on edit button click", async () => {
      const user = userEvent.setup();
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Edit organisation")).toBeInTheDocument();
      });

      const editCard = screen.getByText("Edit organisation").closest("div");
      if (editCard) {
        await user.click(editCard);
        expect(mockNavigate).toHaveBeenCalledWith(
          "/admin/organisations/1/edit",
        );
      }
    });

    it("navigates to manage staff page on manage button click", async () => {
      const user = userEvent.setup();
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Manage staff")).toBeInTheDocument();
      });

      const manageCard = screen.getByText("Manage staff").closest("div");
      if (manageCard) {
        await user.click(manageCard);
        expect(mockNavigate).toHaveBeenCalledWith(
          "/admin/organisations/1/staff",
        );
      }
    });
  });

  describe("Loading state", () => {
    it("shows loading state initially", () => {
      vi.spyOn(apiLib.api, "get").mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      // Page should render (showing loading state)
      expect(screen.queryByText("Test Hospital")).not.toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("handles 404 error", async () => {
      const mockError = new Error("Not found") as Error & {
        response: { status: number };
      };
      mockError.response = { status: 404 };

      vi.spyOn(apiLib.api, "get").mockRejectedValue(mockError);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/999",
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations");
      });
    });

    it("handles general API error", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("API error"));

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
