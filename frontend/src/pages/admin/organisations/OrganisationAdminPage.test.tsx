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
  const emptyFeatures: {
    features: Array<{
      feature_key: string;
      enabled_at: string;
      enabled_by: number;
    }>;
  } = { features: [] };

  /** Mock api.get to return org data and empty features by default */
  function mockOrgApi(org: Record<string, unknown>, features = emptyFeatures) {
    vi.spyOn(apiLib.api, "get").mockImplementation((url: string) => {
      if (url.includes("/features")) return Promise.resolve(features);
      return Promise.resolve(org);
    });
  }

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("No patients assigned")).toBeInTheDocument();
      });
    });
  });

  describe("Inline actions", () => {
    it("displays edit icon in organisation information card", async () => {
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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Edit organisation" }),
        ).toBeInTheDocument();
      });
    });

    it("displays add staff member button in staff section", async () => {
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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Add staff member/ }),
        ).toBeInTheDocument();
      });
    });

    it("displays add patient button in patients section", async () => {
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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Add patient/ }),
        ).toBeInTheDocument();
      });
    });

    it("navigates to edit page on edit icon click", async () => {
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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Edit organisation" }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: "Edit organisation" }),
      );
      expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1/edit");
    });

    it("displays edit icon in features card", async () => {
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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Edit features" }),
        ).toBeInTheDocument();
      });
    });

    it("navigates to features page on edit features icon click", async () => {
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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Edit features" }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: "Edit features" }));
      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/organisations/1/features",
      );
    });

    it("navigates to add staff page on add staff button click", async () => {
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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Add staff member/ }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /Add staff member/ }),
      );
      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/organisations/1/add-staff",
      );
    });

    it("navigates to add patient page on add patient button click", async () => {
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

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Add patient/ }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Add patient/ }));
      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/organisations/1/add-patient",
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

  describe("Enabled features card", () => {
    const baseOrg = {
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

    it("shows enabled features as badges", async () => {
      mockOrgApi(baseOrg, {
        features: [
          {
            feature_key: "teaching",
            enabled_at: "2026-01-15T10:00:00Z",
            enabled_by: 1,
          },
          {
            feature_key: "messaging",
            enabled_at: "2026-01-15T10:00:00Z",
            enabled_by: 1,
          },
        ],
      });

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Enabled features" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Teaching")).toBeInTheDocument();
        expect(screen.getByText("Messaging")).toBeInTheDocument();
      });
    });

    it("shows 'No features enabled' when empty", async () => {
      mockOrgApi(baseOrg);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("No features enabled")).toBeInTheDocument();
      });
    });
  });

  describe("Remove staff member", () => {
    const orgWithStaff = {
      id: 3,
      name: "Test Hospital",
      type: "hospital",
      location: "London",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
      staff_count: 2,
      staff_members: [
        {
          id: 10,
          username: "alice",
          email: "alice@example.com",
          is_primary: true,
        },
        {
          id: 20,
          username: "bob",
          email: "bob@example.com",
          is_primary: false,
        },
      ],
      patient_members: [],
      patient_count: 0,
    };

    it("shows actions menu and opens remove confirmation modal", async () => {
      const user = userEvent.setup();
      mockOrgApi(orgWithStaff);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/3",
      });

      // Wait for staff to render
      await waitFor(() => {
        expect(screen.getByText("alice")).toBeInTheDocument();
      });

      // Click the ellipsis menu for bob
      const actionsButton = screen.getByLabelText("Actions for bob");
      await user.click(actionsButton);

      // Click "Remove from organisation"
      const removeItem = await screen.findByText("Remove from organisation");
      await user.click(removeItem);

      // Modal should appear with bob's name
      expect(screen.getByText("Remove staff member")).toBeInTheDocument();
      expect(screen.getAllByText("bob").length).toBeGreaterThanOrEqual(2);
    });

    it("calls api.del and reloads data on confirm", async () => {
      const user = userEvent.setup();
      mockOrgApi(orgWithStaff);
      const delSpy = vi.spyOn(apiLib.api, "del").mockResolvedValue(undefined);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/3",
      });

      await waitFor(() => {
        expect(screen.getByText("bob")).toBeInTheDocument();
      });

      // Open menu and click remove
      await user.click(screen.getByLabelText("Actions for bob"));
      await user.click(await screen.findByText("Remove from organisation"));

      // Confirm removal
      await user.click(screen.getByRole("button", { name: "Remove" }));

      await waitFor(() => {
        expect(delSpy).toHaveBeenCalledWith("/organizations/3/staff/20");
      });
    });

    it("closes modal on cancel without calling api", async () => {
      const user = userEvent.setup();
      mockOrgApi(orgWithStaff);
      const delSpy = vi.spyOn(apiLib.api, "del").mockResolvedValue(undefined);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/3",
      });

      await waitFor(() => {
        expect(screen.getByText("bob")).toBeInTheDocument();
      });

      // Open menu and click remove
      await user.click(screen.getByLabelText("Actions for bob"));
      await user.click(await screen.findByText("Remove from organisation"));

      // Cancel
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      // Modal should close, api.del not called
      await waitFor(() => {
        expect(
          screen.queryByText("Remove staff member"),
        ).not.toBeInTheDocument();
      });
      expect(delSpy).not.toHaveBeenCalled();
    });
  });
});
