/**
 * OrganisationAdminPage Component Tests
 *
 * Tests for the organisation admin page including:
 * - Loading states
 * - Organisation details display
 * - Staff members list
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

// Mock admin user. Holds what the page's sections ask for: the page now
// draws each section by competency, so an administrator with none would
// see only the staff list.
const mockAdminUser: User = {
  id: "3",
  username: "admin.user",
  email: "admin@example.com",
  competencies: ["manage_users", "manage_staff_membership"],
};

describe("OrganisationAdminPage", () => {
  /**
   * Answer the one request the page makes.
   *
   * An org_unit carries its own people, the org_units inside it, the features
   * switched on there and its patient list, so the page asks once. The
   * fields it does not name default to empty.
   */
  function mockOrgApi(org: Record<string, unknown>, features: string[] = []) {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      type: "hospital_team",
      type_display_name: "Organisation",
      is_root: true,
      parent_id: null,
      location: "",
      is_active: true,
      members: [],
      children: [],
      patient_ids: [],
      clinical_lead_id: null,
      ...org,
      features,
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

  describe("Sites are operator-only for now", () => {
    const withSite = {
      id: 1,
      name: "Test Hospital",
      type: "hospital",
      location: "London, UK",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
      staff_count: 0,
      members: [],
      patient_ids: [],
      patient_count: 0,
      children: [
        {
          id: 7,
          name: "Ward B",
          type: "ward",
          clinical_lead_name: null,
        },
      ],
    };

    function renderPage() {
      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });
    }

    it("does not take an ordinary administrator to a site page", async () => {
      // `/admin/sites/:id` 404s for them, so a row that navigated there
      // would be a dead end. The site is still listed, because knowing
      // the organisation holds it is useful on its own.
      mockOrgApi(withSite);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Ward B")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Ward B"));
      expect(mockNavigate).not.toHaveBeenCalledWith("/admin/sites/7");
    });

    it("hides Add site from an ordinary administrator", async () => {
      mockOrgApi(withSite);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Ward B")).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("button", { name: /add site/i }),
      ).not.toBeInTheDocument();
    });

    it("takes an operator to the site page", async () => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: { ...mockAdminUser, platform_role: "superadmin" },
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });
      mockOrgApi(withSite);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Ward B")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Ward B"));
      expect(mockNavigate).toHaveBeenCalledWith("/admin/sites/7");
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
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

  describe("Staff members list", () => {
    it("displays staff members in table", async () => {
      const mockOrganisation = {
        id: 1,
        name: "Test Hospital",
        type: "hospital",
        location: "London",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
        members: [
          {
            id: "1",
            username: "doctor1",
            full_name: "Dr One",
            email: "doctor1@test.com",
            capacity: "staff",
          },
          {
            id: "2",
            username: "nurse1",
            full_name: "Nurse One",
            email: "nurse1@test.com",
            capacity: "staff",
          },
        ],
        staff_count: 2,
        patient_ids: [],
        patient_count: 0,
      };

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("Dr One")).toBeInTheDocument();
        expect(screen.getByText("Nurse One")).toBeInTheDocument();
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: ["fhir-001", "fhir-002"],
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
        patient_count: 0,
      };

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Add staff/ }),
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
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
        members: [],
        patient_ids: [],
        patient_count: 0,
      };

      mockOrgApi(mockOrganisation);

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Add staff/ }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Add staff/ }));
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
        members: [],
        patient_ids: [],
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
    it("displays not found page on failed API call", async () => {
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
        expect(screen.getByText("404 – Page not found")).toBeInTheDocument();
      });
    });

    it("displays not found page when organisation fetch fails", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("API error"));

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("404 – Page not found")).toBeInTheDocument();
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
      members: [],
      patient_ids: [],
      patient_count: 0,
    };

    it("shows enabled features as badges", async () => {
      mockOrgApi(baseOrg, ["teaching", "messaging"]);

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

  describe("Who counts as staff", () => {
    // The heading says staff members, so the list has to be staff. A
    // org_unit answers with everybody who is there and what each of them
    // is, which is the right answer to a different question: a teaching
    // delegate under this heading is how the page came to be wrong
    // about who worked there.
    it("leaves out somebody who is here as a trainee", async () => {
      mockOrgApi({
        id: 1,
        name: "Test Hospital",
        members: [
          {
            id: 1,
            username: "a_nurse",
            full_name: "A Nurse",
            email: "nurse@example.com",
            capacity: "staff",
          },
          {
            id: 2,
            username: "a_delegate",
            full_name: "A Delegate",
            email: "delegate@example.com",
            capacity: "trainee",
          },
        ],
      });

      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/1",
      });

      await waitFor(() => {
        expect(screen.getByText("A Nurse")).toBeInTheDocument();
      });
      expect(screen.queryByText("A Delegate")).not.toBeInTheDocument();
    });
  });

  describe("Staff members", () => {
    const orgWithStaff = {
      id: 3,
      name: "Test Hospital",
      members: [
        {
          id: 10,
          username: "alice",
          full_name: "Alice Smith",
          email: "alice@example.com",
          capacity: "staff",
          authorised_here: 2,
        },
      ],
    };

    function signedIn(competencies: string[]) {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: { ...mockAdminUser, competencies } as User,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });
    }

    function renderPage() {
      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/3",
      });
    }

    it("shows how many competencies each may practise here", async () => {
      mockOrgApi(orgWithStaff);
      renderPage();

      const row = (await screen.findByText("alice")).closest("tr");
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain("2");
      expect(screen.getByText("Authorised here")).toBeInTheDocument();
    });

    it("opens the member's page for somebody who may authorise practice", async () => {
      const user = userEvent.setup();
      signedIn(["manage_practising_competencies"]);
      mockOrgApi(orgWithStaff);
      renderPage();

      await user.click(await screen.findByText("alice"));

      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/organisations/3/members/10",
      );
    });

    it("keeps the user page for anybody else", async () => {
      const user = userEvent.setup();
      mockOrgApi(orgWithStaff);
      renderPage();

      await user.click(await screen.findByText("alice"));

      expect(mockNavigate).toHaveBeenCalledWith("/admin/users/10");
    });

    it("no longer carries the who may practise here card", async () => {
      mockOrgApi(orgWithStaff);
      renderPage();

      await screen.findByText("alice");
      expect(
        screen.queryByText("Who may practise here"),
      ).not.toBeInTheDocument();
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
      members: [
        {
          id: 10,
          username: "alice",
          full_name: "Alice Smith",
          email: "alice@example.com",
          capacity: "staff",
        },
        {
          id: 20,
          username: "bob",
          full_name: "Bob Jones",
          email: "bob@example.com",
          capacity: "staff",
        },
      ],
      patient_ids: [],
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
        expect(delSpy).toHaveBeenCalledWith("/org-units/3/members/20");
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

  describe("A teaching admin", () => {
    // Reaches the page through `manage_teaching`. The backend sends them
    // no patients or features; the page offers them the staff and nothing
    // that leads to a route they would 404 on.
    const teachingOrg = {
      id: 3,
      name: "Teaching Trust",
      members: [
        {
          id: 10,
          username: "delegate",
          full_name: "Dee Legate",
          email: "delegate@example.com",
          capacity: "staff",
          authorised_here: 1,
        },
      ],
      children: [
        {
          id: 7,
          name: "Ward B",
          type: "ward",
          is_active: true,
          clinical_lead_name: null,
        },
      ],
    };

    beforeEach(() => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: { ...mockAdminUser, competencies: ["manage_teaching"] },
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });
      mockOrgApi(teachingOrg);
      renderWithRouter(<OrganisationAdminPage />, {
        routePath: "/admin/organisations/:id",
        initialRoute: "/admin/organisations/3",
      });
    });

    it("may add and remove staff", async () => {
      await screen.findByText("delegate");
      expect(screen.getByText("Add staff")).toBeInTheDocument();
      expect(screen.getByLabelText("Actions for delegate")).toBeInTheDocument();
    });

    it("opens a member's practice page", async () => {
      const user = userEvent.setup();
      await user.click(await screen.findByText("delegate"));

      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/organisations/3/members/10",
      );
    });

    it("is not offered patients, features or editing the organisation", async () => {
      await screen.findByText("delegate");
      expect(screen.queryByText("Patients")).not.toBeInTheDocument();
      expect(screen.queryByText("Enabled features")).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Edit organisation"),
      ).not.toBeInTheDocument();
    });

    it("sees the sites but may not remove them", async () => {
      await screen.findByText("Ward B");
      expect(
        screen.queryByLabelText("Actions for Ward B"),
      ).not.toBeInTheDocument();
    });
  });
});
