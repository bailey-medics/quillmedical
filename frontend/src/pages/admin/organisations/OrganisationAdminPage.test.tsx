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
        staff_count: 0,
        staff_members: [],
        patient_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Test Hospital" }),
        ).toBeInTheDocument();
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
        staff_count: 0,
        staff_members: [],
        patient_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Clinic")).toBeInTheDocument();
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
        patient_members: [],
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

    it("displays 'Not specified' when location is null", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Org",
        type: "clinic",
        location: null,
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_count: 0,
        staff_members: [],
        patient_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Not specified")).toBeInTheDocument();
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
        staff_count: 2,
        staff_members: [
          {
            id: 1,
            username: "doctor1",
            email: "doctor1@test.com",
            is_primary: false,
          },
          {
            id: 2,
            username: "doctor2",
            email: "doctor2@test.com",
            is_primary: false,
          },
        ],
        patient_members: [],
        patient_count: 5,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        const statsSection = screen.getByText("Statistics").closest("div");
        expect(statsSection).toHaveTextContent("2");
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
        patient_members: [],
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
        patient_members: [],
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
        patient_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByText("No staff members assigned"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Patients table", () => {
    it("displays patients in table", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_members: [
          { patient_id: "fhir-001", is_primary: false },
          { patient_id: "fhir-002", is_primary: true },
        ],
        patient_count: 2,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("fhir-001")).toBeInTheDocument();
        expect(screen.getByText("fhir-002")).toBeInTheDocument();
      });
    });

    it("shows message when no patients", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Clinic",
        type: "clinic",
        location: "Manchester",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("No patients assigned")).toBeInTheDocument();
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
        patient_members: [],
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
        patient_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Add staff member")).toBeInTheDocument();
      });
    });

    it("displays add patient action card", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        staff_members: [],
        patient_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getAllByText("Add patient").length,
        ).toBeGreaterThanOrEqual(1);
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
        staff_count: 0,
        staff_members: [],
        patient_members: [],
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

      const editButton = screen.getByRole("button", { name: "Edit" });
      await user.click(editButton);
      expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1/edit");
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
        staff_count: 0,
        staff_members: [],
        patient_members: [],
        patient_count: 0,
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Add staff member")).toBeInTheDocument();
      });

      const manageButton = screen.getByRole("button", { name: "Add staff" });
      await user.click(manageButton);
      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/organisations/1/add-staff",
      );
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
    it("displays error alert on failed API call", async () => {
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
        expect(
          screen.getByText("Error loading organisation"),
        ).toBeInTheDocument();
        expect(screen.getByText("Not found")).toBeInTheDocument();
      });
    });

    it("displays generic error message when organisation not found", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("API error"));

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByText("Error loading organisation"),
        ).toBeInTheDocument();
        expect(screen.getByText("API error")).toBeInTheDocument();
      });
    });
  });
});
