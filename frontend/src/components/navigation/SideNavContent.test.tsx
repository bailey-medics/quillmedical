import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import SideNavContent from "./SideNavContent";
import { AuthProvider } from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import type { NavItem } from "./NestedNavLink";

// Mock users with different permission levels
const mockUsers: Record<string, User> = {
  staff: {
    id: "2",
    username: "staff.user",
    email: "staff@example.com",
    roles: ["Clinician"],
    clinical_services_enabled: true,
  },
  admin: {
    id: "3",
    username: "admin.user",
    email: "admin@example.com",
    roles: ["Clinician", "Administrator"],
    competencies: ["manage_users"],
    clinical_services_enabled: true,
  },
  // Reaches Admin through `manage_teaching`, which opens it to them
  // without the patient pages.
  teaching_admin: {
    id: "5",
    username: "teaching.admin",
    email: "teaching@example.com",
    roles: [],
    competencies: ["manage_teaching"],
    clinical_services_enabled: true,
  },
  superadmin: {
    id: "4",
    username: "superadmin.user",
    email: "superadmin@example.com",
    roles: ["Clinician", "Administrator"],
    competencies: ["manage_users"],
    // Operating Quill itself, which is what `RequireOperator` and the
    // Sites link both read. Without it this fixture was a name only,
    // indistinguishable from `admin`.
    platform_role: "superadmin",
    clinical_services_enabled: true,
  },
  patient: {
    id: "1",
    username: "patient.user",
    email: "patient@example.com",
    roles: ["Patient"],
    clinical_services_enabled: true,
  },
  staff_no_clinical: {
    id: "5",
    username: "staff.teaching",
    email: "teaching@example.com",
    roles: ["Clinician"],
    clinical_services_enabled: false,
  },
  passport_holder: {
    id: "7",
    username: "passport.holder",
    email: "passport@example.com",
    roles: ["Clinician"],
    competencies: ["assess_clinician_passport", "passport_write"],
    enabled_features: ["passport"],
    clinical_services_enabled: true,
  },
  // Can sign off somebody else's competency and holds no record of
  // their own: an invited external assessor, who cannot create a
  // passport because nothing has granted them `passport_write`.
  passport_assessor_only: {
    id: "9",
    username: "passport.assessor",
    email: "assessor@example.com",
    roles: ["Clinician"],
    competencies: ["assess_clinician_passport"],
    enabled_features: ["passport"],
    clinical_services_enabled: true,
  },
  // Holds a passport of their own and belongs nowhere the passport is
  // switched on, as somebody removed from the one org_unit that had it.
  passport_owner_without_feature: {
    id: "10",
    username: "passport.leaver",
    email: "leaver@example.com",
    roles: ["Clinician"],
    competencies: ["assess_clinician_passport", "passport_write"],
    enabled_features: [],
    owns_passport: true,
    clinical_services_enabled: true,
  },
  passport_feature_only: {
    id: "8",
    username: "passport.feature.only",
    email: "feature.only@example.com",
    roles: ["Clinician"],
    enabled_features: ["passport"],
    clinical_services_enabled: true,
  },
  safety_only: {
    id: "11",
    username: "safety.officer",
    email: "safety@example.com",
    roles: ["Clinician"],
    competencies: ["view_safety_cases"],
    enabled_features: ["safety"],
    clinical_services_enabled: false,
  },
  // The feature reaches them but nothing has given them the competency.
  safety_feature_only: {
    id: "12",
    username: "safety.feature.only",
    email: "safety.feature.only@example.com",
    roles: ["Clinician"],
    enabled_features: ["safety"],
    clinical_services_enabled: false,
  },
  // Runs the safety mock-up at their org units, reaching Admin through
  // `manage_safety` as a teaching admin does through `manage_teaching`.
  safety_admin: {
    id: "13",
    username: "safety.admin",
    email: "safety.admin@example.com",
    roles: [],
    competencies: ["view_safety_cases", "manage_safety"],
    enabled_features: ["safety"],
    clinical_services_enabled: false,
  },
  admin_no_clinical: {
    id: "6",
    username: "admin.teaching",
    email: "admin.teaching@example.com",
    roles: ["Clinician", "Administrator"],
    competencies: ["manage_users"],
    clinical_services_enabled: false,
  },
};

/** The organisations list, as `/org-units?roots=true` answers it. */
function organisationsList(count: number) {
  return {
    org_units: Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: `Trust ${index + 1}`,
      is_root: true,
    })),
  };
}

function renderWithAuth(
  ui: React.ReactElement,
  userType: keyof typeof mockUsers = "staff",
  options?: { initialRoute?: string; organisations?: number },
) {
  const mockUser = mockUsers[userType];
  // One by default: most administrators administer an organisation.
  const organisations = options?.organisations ?? 1;

  // Mock fetch to return the appropriate user
  global.fetch = vi.fn((url: string | URL | Request) => {
    const urlString = typeof url === "string" ? url : url.toString();

    const answer = urlString.includes("/auth/me")
      ? mockUser
      : urlString.includes("/org-units?roots=true")
        ? organisationsList(organisations)
        : null;
    if (answer !== null) {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "Content-Type": "application/json" }),
        json: () => Promise.resolve(answer),
      } as Response);
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({}),
    } as Response);
  }) as typeof global.fetch;

  return renderWithRouter(<AuthProvider>{ui}</AuthProvider>, {
    initialRoute: options?.initialRoute,
  });
}

describe("SideNavContent Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic rendering", () => {
    it("renders all base navigation links", async () => {
      renderWithAuth(<SideNavContent />);

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Messages")).toBeInTheDocument();
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Logout")).toBeInTheDocument();
      });
    });

    it("does not show Admin link for staff users", async () => {
      renderWithAuth(<SideNavContent />, "staff");

      await waitFor(() => {
        expect(screen.queryByText("Admin")).not.toBeInTheDocument();
      });
    });

    it("does not show Admin link for patient users", async () => {
      renderWithAuth(<SideNavContent />, "patient");

      await waitFor(() => {
        expect(screen.queryByText("Admin")).not.toBeInTheDocument();
      });
    });

    it("shows Admin link for admin users", async () => {
      renderWithAuth(<SideNavContent />, "admin");

      await waitFor(() => {
        expect(screen.getByText("Admin")).toBeInTheDocument();
      });
    });

    it("shows Admin link for superadmin users", async () => {
      renderWithAuth(<SideNavContent />, "superadmin");

      await waitFor(() => {
        expect(screen.getByText("Admin")).toBeInTheDocument();
      });
    });
  });

  describe("Navigation behavior", () => {
    it("calls onNavigate callback when Home is clicked", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      renderWithAuth(<SideNavContent onNavigate={onNavigate} />);

      await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());

      await user.click(screen.getByText("Home"));
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it("calls onNavigate callback when Messages is clicked", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      renderWithAuth(<SideNavContent onNavigate={onNavigate} />);

      await waitFor(() =>
        expect(screen.getByText("Messages")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("Messages"));
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it("calls onNavigate callback when Settings is clicked", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      renderWithAuth(<SideNavContent onNavigate={onNavigate} />);

      await waitFor(() =>
        expect(screen.getByText("Settings")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("Settings"));
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it("keeps the drawer open when Admin is clicked, so its pages can be chosen", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      renderWithAuth(<SideNavContent onNavigate={onNavigate} />, "admin");

      await waitFor(() =>
        expect(screen.getByText("Admin")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("Admin"));
      expect(onNavigate).not.toHaveBeenCalled();

      await user.click(await screen.findByText("Users"));
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it("does not error when onNavigate is not provided", async () => {
      const user = userEvent.setup();
      renderWithAuth(<SideNavContent />);

      await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());

      // Should not throw error
      await user.click(screen.getByText("Home"));
      expect(screen.getByText("Home")).toBeInTheDocument();
    });
  });

  describe("Icon display", () => {
    it("shows icons when showIcons is true", async () => {
      const { container } = renderWithAuth(<SideNavContent showIcons={true} />);

      await waitFor(() => {
        const icons = container.querySelectorAll("svg");
        expect(icons.length).toBeGreaterThan(0);
      });
    });

    it("does not show icons when showIcons is false", async () => {
      const { container } = renderWithAuth(
        <SideNavContent showIcons={false} />,
      );

      await waitFor(() => {
        const themeIcons = container.querySelectorAll(
          ".mantine-ThemeIcon-root",
        );
        expect(themeIcons.length).toBe(0);
      });
    });

    it("defaults to not showing icons", async () => {
      const { container } = renderWithAuth(<SideNavContent />);

      await waitFor(() => {
        const themeIcons = container.querySelectorAll(
          ".mantine-ThemeIcon-root",
        );
        expect(themeIcons.length).toBe(0);
      });
    });
  });

  describe("Font size", () => {
    it("uses responsive font size from design system", async () => {
      renderWithAuth(<SideNavContent />);

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
      });
      // Font size is var(--mantine-font-size-md): 16px mobile, 19px desktop
    });
  });

  describe("Permission-based visibility", () => {
    it("renders exactly 4 links for staff (Home, Messages, Settings, Logout)", async () => {
      renderWithAuth(<SideNavContent />, "staff");

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Messages")).toBeInTheDocument();
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Logout")).toBeInTheDocument();
        expect(screen.queryByText("Admin")).not.toBeInTheDocument();
      });
    });

    it("renders exactly 5 links for admin (includes Admin link)", async () => {
      renderWithAuth(<SideNavContent />, "admin");

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Messages")).toBeInTheDocument();
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Admin")).toBeInTheDocument();
        expect(screen.getByText("Logout")).toBeInTheDocument();
      });
    });

    it("renders exactly 5 links for superadmin (includes Admin link)", async () => {
      renderWithAuth(<SideNavContent />, "superadmin");

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Messages")).toBeInTheDocument();
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Admin")).toBeInTheDocument();
        expect(screen.getByText("Logout")).toBeInTheDocument();
      });
    });
  });

  describe("Patient navigation", () => {
    const patientBase: NavItem = {
      label: "John Smith",
      href: "/patients/patient-123",
    };

    it("does not show patient nav when patientNav is not provided", async () => {
      renderWithAuth(<SideNavContent />);

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
      });

      expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
    });

    it("shows patient name when patientNav has one item", async () => {
      renderWithAuth(<SideNavContent patientNav={[patientBase]} />, "staff", {
        initialRoute: "/patients/patient-123",
      });

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });
    });

    it("does not show patient nav when patientNav is empty", async () => {
      renderWithAuth(<SideNavContent patientNav={[]} />, "staff", {
        initialRoute: "/patients/patient-123",
      });

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
      });

      expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
    });

    it("shows sub-page label for messages", async () => {
      renderWithAuth(
        <SideNavContent
          patientNav={[
            patientBase,
            { label: "Messages", href: "/patients/patient-123/messages" },
          ]}
        />,
        "staff",
        { initialRoute: "/patients/patient-123/messages" },
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
        // "Messages" appears both as patient sub-page and main nav link
        const messagesLinks = screen.getAllByText("Messages");
        expect(messagesLinks.length).toBe(2);
      });
    });

    it("shows sub-page label for letters", async () => {
      renderWithAuth(
        <SideNavContent
          patientNav={[
            patientBase,
            {
              label: "Clinical letters",
              href: "/patients/patient-123/letters",
            },
          ]}
        />,
        "staff",
        { initialRoute: "/patients/patient-123/letters" },
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
        expect(screen.getByText("Clinical letters")).toBeInTheDocument();
      });
    });

    it("shows sub-page label for notes", async () => {
      renderWithAuth(
        <SideNavContent
          patientNav={[
            patientBase,
            { label: "Clinical notes", href: "/patients/patient-123/notes" },
          ]}
        />,
        "staff",
        { initialRoute: "/patients/patient-123/notes" },
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
        expect(screen.getByText("Clinical notes")).toBeInTheDocument();
      });
    });

    it("shows sub-page label for appointments", async () => {
      renderWithAuth(
        <SideNavContent
          patientNav={[
            patientBase,
            {
              label: "Appointments",
              href: "/patients/patient-123/appointments",
            },
          ]}
        />,
        "staff",
        { initialRoute: "/patients/patient-123/appointments" },
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
        expect(screen.getByText("Appointments")).toBeInTheDocument();
      });
    });

    it("shows thread label for known conversation", async () => {
      renderWithAuth(
        <SideNavContent
          patientNav={[
            patientBase,
            { label: "Messages", href: "/patients/patient-123/messages" },
            {
              label: "Dr Fenwick, Imogen",
              href: "/patients/patient-123/messages/gastro-clinic",
            },
          ]}
        />,
        "staff",
        { initialRoute: "/patients/patient-123/messages/gastro-clinic" },
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
        // "Messages" appears both as patient sub-page and main nav link
        const messagesLinks = screen.getAllByText("Messages");
        expect(messagesLinks.length).toBe(2);
        expect(screen.getByText("Dr Fenwick, Imogen")).toBeInTheDocument();
      });
    });

    it("shows user icon when showIcons is true", async () => {
      const { container } = renderWithAuth(
        <SideNavContent patientNav={[patientBase]} showIcons />,
        "staff",
        { initialRoute: "/patients/patient-123" },
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      // Should have at least one SVG icon for the patient nav
      const icons = container.querySelectorAll("svg");
      expect(icons.length).toBeGreaterThan(0);
    });

    it("renders divider between patient nav and main nav", async () => {
      const { container } = renderWithAuth(
        <SideNavContent patientNav={[patientBase]} />,
        "staff",
        { initialRoute: "/patients/patient-123" },
      );

      await waitFor(() => {
        expect(screen.getByText("John Smith")).toBeInTheDocument();
      });

      const divider = container.querySelector('[role="separator"]');
      expect(divider).toBeInTheDocument();
    });
  });

  describe("Clinical services disabled", () => {
    it("hides Home and Messages when clinical services are disabled", async () => {
      renderWithAuth(<SideNavContent />, "staff_no_clinical");

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Logout")).toBeInTheDocument();
        expect(screen.queryByText("Home")).not.toBeInTheDocument();
        expect(screen.queryByText("Messages")).not.toBeInTheDocument();
      });
    });

    it("hides Patients from Admin when clinical services are disabled", async () => {
      renderWithAuth(<SideNavContent />, "admin_no_clinical");

      await waitFor(() => {
        expect(screen.getByText("Admin")).toBeInTheDocument();
      });

      // Expand Admin to check children
      const adminLink = screen.getByText("Admin");
      await userEvent.click(adminLink);

      expect(screen.queryByText("Patients")).not.toBeInTheDocument();
      expect(screen.getByText("Users")).toBeInTheDocument();
      expect(screen.getByText("Organisations")).toBeInTheDocument();
    });

    it("shows a teaching admin Admin without Patients", async () => {
      renderWithAuth(<SideNavContent />, "teaching_admin");

      await waitFor(() => {
        expect(screen.getByText("Admin")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByText("Admin"));

      expect(screen.queryByText("Patients")).not.toBeInTheDocument();
      expect(screen.getByText("Users")).toBeInTheDocument();
      expect(screen.getByText("Organisations")).toBeInTheDocument();
    });

    it("still shows Settings and Logout when clinical services are disabled", async () => {
      renderWithAuth(<SideNavContent />, "staff_no_clinical");

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Logout")).toBeInTheDocument();
      });
    });
  });

  describe("Where you are", () => {
    // The breadcrumb used to ask `/organisations/{id}` with what is now
    // an org_unit id, so it named whichever organisation happened to hold
    // that number. Both kinds of org_unit come from one address now.
    function place(over: Record<string, unknown> = {}) {
      return {
        id: 5,
        name: "Ward 1",
        type: "ward",
        type_display_name: "Ward",
        is_root: false,
        parent_id: 10,
        parent_name: "Test Trust",
        parent_is_root: true,
        location: "",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        members: [],
        children: [],
        features: [],
        patient_ids: [],
        clinical_lead_id: null,
        ...over,
      };
    }

    /** Render at a route, answering /auth/me and the org_unit address. */
    function renderAt(route: string, body: Record<string, unknown>) {
      const asked: string[] = [];
      const user = mockUsers.admin;

      global.fetch = vi.fn((url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url.toString();
        asked.push(urlString);

        const answer = urlString.includes("/auth/me")
          ? user
          : urlString.includes("/org-units?roots=true")
            ? organisationsList(1)
            : urlString.includes("/org-units/")
              ? body
              : null;

        if (answer === null) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: "Not Found",
            json: () => Promise.resolve({}),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "Content-Type": "application/json" }),
          json: () => Promise.resolve(answer),
        } as Response);
      }) as typeof global.fetch;

      renderWithRouter(
        <AuthProvider>
          <SideNavContent />
        </AuthProvider>,
        { initialRoute: route },
      );

      return asked;
    }

    it("names the place and the one above it", async () => {
      const asked = renderAt("/admin/sites/5", place());

      await waitFor(() => {
        expect(screen.getByText("Ward 1")).toBeInTheDocument();
      });
      expect(screen.getByText("Test Trust")).toBeInTheDocument();
      expect(asked.some((url) => url.endsWith("/org-units/5"))).toBe(true);
    });

    it("goes up to a site when the place above is not an organisation", async () => {
      const user = userEvent.setup();
      const asked = renderAt(
        "/admin/sites/5",
        place({
          parent_id: 11,
          parent_name: "Main building",
          parent_is_root: false,
        }),
      );

      await waitFor(() => {
        expect(screen.getByText("Main building")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Main building"));

      // A building is an org_unit, not an organisation, so going up lands on
      // the org_unit page rather than the organisation one.
      await waitFor(() => {
        expect(asked.some((url) => url.endsWith("/org-units/11"))).toBe(true);
      });
    });

    it("names the member on a member's page, by username", async () => {
      // One answer serves both addresses: the place, and the member there.
      const asked = renderAt(
        "/admin/organisations/5/members/4",
        place({ username: "a.patel" }),
      );

      await waitFor(() => {
        expect(screen.getByText("a.patel")).toBeInTheDocument();
      });
      expect(
        asked.some((url) => url.endsWith("/org-units/5/members/4/practice")),
      ).toBe(true);
    });

    it("asks about nothing on the create page", async () => {
      // "new" is a page, not an org_unit.
      const asked = renderAt("/admin/sites/new", place());

      await waitFor(() => {
        expect(screen.getByText("Admin")).toBeInTheDocument();
      });
      expect(asked.some((url) => url.includes("/org-units/"))).toBe(false);
    });
  });

  describe("Sites", () => {
    it("offers Sites to somebody who operates Quill", async () => {
      renderWithAuth(<SideNavContent />, "superadmin");

      await waitFor(() => {
        expect(screen.getByText("Sites")).toBeInTheDocument();
      });
    });

    it("offers Sites to an administrator who does not operate Quill", async () => {
      renderWithAuth(<SideNavContent />, "admin");

      await waitFor(() => {
        expect(screen.getByText("Organisations")).toBeInTheDocument();
      });
      expect(screen.getByText("Sites")).toBeInTheDocument();
    });

    it("hides Organisations from somebody who administers none", async () => {
      // A site's admin: the organisations list would be empty, so Sites
      // is their way in.
      renderWithAuth(<SideNavContent />, "teaching_admin", {
        organisations: 0,
      });

      // Offered until the list answers, then taken away.
      await waitFor(() => {
        expect(screen.getByText("Sites")).toBeInTheDocument();
        expect(screen.queryByText("Organisations")).not.toBeInTheDocument();
      });
    });

    it("offers Organisations to an operator without asking", async () => {
      renderWithAuth(<SideNavContent />, "superadmin", { organisations: 0 });

      await waitFor(() => {
        expect(screen.getByText("Organisations")).toBeInTheDocument();
      });
      expect(
        vi
          .mocked(global.fetch)
          .mock.calls.some(([url]) => String(url).includes("roots=true")),
      ).toBe(false);
    });

    it("hangs a site's pages under Sites when there is no Organisations", async () => {
      renderWithAuth(<SideNavContent />, "teaching_admin", {
        organisations: 0,
        initialRoute: "/admin/sites/4",
      });

      // With no Organisations entry, the only place the open site can
      // hang is under Sites. The site cannot be read here, so it shows
      // as its placeholder.
      await waitFor(() => {
        expect(screen.getByText("Sites")).toBeInTheDocument();
        expect(screen.queryByText("Organisations")).not.toBeInTheDocument();
        expect(screen.getByText("…").closest("a")).toHaveAttribute(
          "href",
          "/admin/sites/4",
        );
      });
    });

    it("highlights Sites at /admin/sites", async () => {
      renderWithAuth(<SideNavContent />, "superadmin", {
        initialRoute: "/admin/sites",
      });

      await waitFor(() => {
        expect(screen.getByText("Sites")).toBeInTheDocument();
      });
      expect(screen.getByText("Sites").closest("a")).toHaveAttribute(
        "data-active",
        "true",
      );
    });

    it("names the create form under Sites, and highlights that", async () => {
      // Sites itself used to stay lit here, so the menu could not tell
      // the form from the list.
      renderWithAuth(<SideNavContent />, "superadmin", {
        initialRoute: "/admin/sites/new",
      });

      await waitFor(() => {
        expect(screen.getByText("New site")).toBeInTheDocument();
      });
      expect(screen.getByText("New site").closest("a")).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(screen.getByText("Sites").closest("a")).not.toHaveAttribute(
        "data-active",
      );
    });

    // One site's pages are named under its organisation, which is the
    // entry that lights up. Sites lit as well said you were in two places.
    it.each([
      "/admin/sites/4",
      "/admin/sites/4/features",
      "/admin/sites/4/members/7",
    ])("does not highlight Sites at %s", async (route) => {
      renderWithAuth(<SideNavContent />, "superadmin", {
        initialRoute: route,
      });

      await waitFor(() => {
        expect(screen.getByText("Sites")).toBeInTheDocument();
      });
      expect(screen.getByText("Sites").closest("a")).not.toHaveAttribute(
        "data-active",
      );
    });
  });

  describe("Safety", () => {
    it("shows Safety to somebody holding the feature and the competency", async () => {
      renderWithAuth(<SideNavContent />, "safety_only");

      await waitFor(() => {
        expect(screen.getByText("Safety")).toBeInTheDocument();
      });
      expect(screen.getByText("Safety").closest("a")).toHaveAttribute(
        "href",
        "/safety",
      );
    });

    it("hides Safety from somebody the feature does not reach", async () => {
      renderWithAuth(<SideNavContent />, "staff");

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });
      expect(screen.queryByText("Safety")).not.toBeInTheDocument();
    });

    it("hides Safety from somebody with the feature but not the competency", async () => {
      // Gated as the passport is: the route carries RequireCompetency
      // too, so a link here would lead to a 404.
      renderWithAuth(<SideNavContent />, "safety_feature_only");

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });
      expect(screen.queryByText("Safety")).not.toBeInTheDocument();
    });

    it.each([
      ["/safety/sc-001/documentation", "Documentation"],
      ["/safety/sc-001/hazards", "Hazards"],
      ["/safety/sc-001/incidents", "Incidents"],
      ["/safety/sc-001/officers", "Officers"],
      ["/safety/sc-001/sign-off", "Compliance sign-off"],
      ["/safety/sc-001/placeholders", "Placeholders"],
    ])(
      "hangs the open case page under Safety, and marks it: %s",
      async (route, label) => {
        renderWithAuth(<SideNavContent />, "safety_only", {
          initialRoute: route,
        });

        await waitFor(() => {
          expect(screen.getByText("Safety")).toBeInTheDocument();
        });

        const child = screen.getByText(label).closest("a");
        expect(child).toHaveAttribute("href", route);
        expect(child).toHaveAttribute("data-active", "true");
      },
    );

    it("opens Admin to a safety admin, with Safety a top-level entry only", async () => {
      // `manage_safety` is a scoped manager, so Admin is theirs; there is
      // no safety page under it, the competencies and professions being
      // the whole of what mirrors teaching here.
      renderWithAuth(<SideNavContent />, "safety_admin");

      await waitFor(() => {
        expect(screen.getByText("Admin")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByText("Admin"));

      const links = screen.getAllByText("Safety").map((el) => el.closest("a"));
      expect(links.map((link) => link?.getAttribute("href"))).toEqual([
        "/safety",
      ]);
      expect(screen.queryByText("Patients")).not.toBeInTheDocument();
    });

    it.each([
      ["/safety/sc-001/documentation/crmp", "Documentation", "Document"],
      ["/safety/sc-001/hazards/H-01", "Hazards", "Hazard"],
      ["/safety/sc-001/incidents/INC-2026-004", "Incidents", "Incident"],
      ["/safety/sc-001/placeholders/edit", "Placeholders", "Edit"],
      ["/safety/sc-001/documentation/crmp/edit", "Documentation", "Edit"],
      ["/safety/sc-001/sign-off/approval", "Compliance sign-off", "Section"],
    ])("hangs the record under its page on %s", async (route, page, detail) => {
      renderWithAuth(<SideNavContent />, "safety_only", {
        initialRoute: route,
      });

      await waitFor(() => {
        expect(screen.getByText(page)).toBeInTheDocument();
      });

      const child = screen.getByText(detail).closest("a");
      expect(child).toHaveAttribute("href", route);
      expect(child).toHaveAttribute("data-active", "true");
    });

    it("hangs nothing under Safety on the case page itself", async () => {
      // The case page is a destination, not a heading: its cards link
      // to the pages beneath it.
      renderWithAuth(<SideNavContent />, "safety_only", {
        initialRoute: "/safety/sc-001",
      });

      await waitFor(() => {
        expect(screen.getByText("Safety")).toBeInTheDocument();
      });
      expect(screen.queryByText("Hazards")).not.toBeInTheDocument();
    });
  });

  describe("Passport", () => {
    it("shows Passport to somebody holding the feature and the competency", async () => {
      renderWithAuth(<SideNavContent />, "passport_holder");

      await waitFor(() => {
        expect(screen.getByText("Passport")).toBeInTheDocument();
      });
    });

    it("shows Passport to a holder the feature does not reach", async () => {
      // Their own record stays theirs to read and export
      renderWithAuth(<SideNavContent />, "passport_owner_without_feature");

      await waitFor(() => {
        expect(screen.getByText("Passport")).toBeInTheDocument();
      });
    });

    it("offers the sign-off queue to somebody who can only assess", async () => {
      // Their one page is other people's records awaiting their
      // judgement. `/passport` would greet them with an offer to start
      // a passport they have no way to create, and hide the queue
      // behind a button in the corner.
      renderWithAuth(<SideNavContent />, "passport_assessor_only");

      await waitFor(() => {
        expect(screen.getByText("Sign-off requests")).toBeInTheDocument();
      });

      expect(screen.queryByText("Passport")).not.toBeInTheDocument();
    });

    it("offers the passport itself to a holder, not the queue", async () => {
      // Holding `passport_write` means there is a record of their own
      // to land on, whether or not they have started it yet.
      renderWithAuth(<SideNavContent />, "passport_holder");

      await waitFor(() => {
        expect(screen.getByText("Passport")).toBeInTheDocument();
      });

      expect(screen.queryByText("Sign-off requests")).not.toBeInTheDocument();
    });

    it("hangs Inbox under Passport for a holder", async () => {
      // A holder's own record is what `/passport` shows, so the
      // requests naming them as an assessor had no way in short of
      // typing the address.
      // Rendered on the inbox itself, because a nested link is only
      // drawn once its parent is the active route.
      renderWithAuth(<SideNavContent />, "passport_holder", {
        initialRoute: "/passport/inbox",
      });

      await waitFor(() => {
        expect(screen.getByText("Passport")).toBeInTheDocument();
      });

      expect(screen.getByText("Inbox")).toBeInTheDocument();
    });

    it.each([
      ["/passport/sign-offs", "Sign-offs"],
      ["/passport/logbook", "Logbook"],
      ["/passport/cpd", "CPD"],
      ["/passport/certificates", "Certificates"],
      ["/passport/reflections", "Reflections"],
      ["/passport/download", "Download"],
    ])(
      "hangs the open page under Passport, and marks it: %s",
      async (route, label) => {
        renderWithAuth(<SideNavContent />, "passport_holder", {
          initialRoute: route,
        });

        await waitFor(() => {
          expect(screen.getByText("Passport")).toBeInTheDocument();
        });

        const child = screen.getByText(label).closest("a");
        expect(child).toHaveAttribute("href", route);
        expect(child).toHaveAttribute("data-active", "true");
      },
    );

    it("keeps CPD under Passport on a single CPD activity", async () => {
      // An activity sits beneath the CPD page, so the side navigation
      // says CPD rather than dropping back to Passport alone.
      renderWithAuth(<SideNavContent />, "passport_holder", {
        initialRoute: "/passport/cpd/2026/course",
      });

      await waitFor(() => {
        expect(screen.getByText("CPD")).toBeInTheDocument();
      });
    });

    it.each([
      ["/passport/cpd/2026/2026-09-28-062503", "CPD", "Activity"],
      [
        "/passport/logbook/perform_cannulation/20260314T1432",
        "Logbook",
        "Entry",
      ],
      ["/passport/sign-offs/2026-03-14-bronchoscopy", "Sign-offs", "Sign-off"],
      [
        "/passport/certificates/2025-11-04-bronchoscopy-course",
        "Certificates",
        "Certificate",
      ],
      [
        "/passport/reflections/2026-01-12-difficult-airway",
        "Reflections",
        "Reflection",
      ],
    ])(
      "nests the record's own link under its section on %s",
      async (route, section, record) => {
        renderWithAuth(<SideNavContent />, "passport_holder", {
          initialRoute: route,
        });

        await waitFor(() => {
          expect(screen.getByText(section)).toBeInTheDocument();
        });
        const child = screen.getByText(record).closest("a");
        expect(child).toHaveAttribute("href", route);
        expect(child).toHaveAttribute("data-active", "true");
      },
    );

    it("shows no record link on the section's own page", async () => {
      renderWithAuth(<SideNavContent />, "passport_holder", {
        initialRoute: "/passport/cpd",
      });

      await waitFor(() => {
        expect(screen.getByText("CPD")).toBeInTheDocument();
      });
      expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    });

    it("hangs only the open page, not every passport page", async () => {
      // The passport page links to the rest; the side navigation says
      // where somebody is, not everywhere they could go.
      renderWithAuth(<SideNavContent />, "passport_holder", {
        initialRoute: "/passport/logbook",
      });

      await waitFor(() => {
        expect(screen.getByText("Logbook")).toBeInTheDocument();
      });

      for (const other of ["Sign-offs", "CPD", "Certificates", "Inbox"]) {
        expect(screen.queryByText(other)).not.toBeInTheDocument();
      }
    });

    it("hangs CPD date ranges under Settings while it is open", async () => {
      renderWithAuth(<SideNavContent />, "passport_holder", {
        initialRoute: "/settings/cpd-date-ranges",
      });

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });
      const child = screen.getByText("CPD date ranges").closest("a");
      expect(child).toHaveAttribute("href", "/settings/cpd-date-ranges");
      expect(child).toHaveAttribute("data-active", "true");
    });

    it("hangs nothing under Settings on the settings page itself", async () => {
      renderWithAuth(<SideNavContent />, "passport_holder", {
        initialRoute: "/settings",
      });

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });
      expect(screen.queryByText("CPD date ranges")).not.toBeInTheDocument();
    });

    it("offers CPD date ranges to nobody without a passport", async () => {
      // The page sits inside the passport's gates, so the link would
      // lead to a 404.
      renderWithAuth(<SideNavContent />, "passport_assessor_only", {
        initialRoute: "/settings/cpd-date-ranges",
      });

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });
      expect(screen.queryByText("CPD date ranges")).not.toBeInTheDocument();
    });

    it("drops Inbox again once the holder is on their passport", async () => {
      // The passport is a destination, not a heading, so landing on it
      // should not reveal a page the person did not ask for.
      renderWithAuth(<SideNavContent />, "passport_holder", {
        initialRoute: "/passport",
      });

      await waitFor(() => {
        expect(screen.getByText("Passport")).toBeInTheDocument();
      });

      expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
    });

    it("gives an assessor no Inbox child, because that is their own link", async () => {
      // "Sign-off requests" already points at `/passport/inbox`.
      // A child of the same address would offer the page twice.
      renderWithAuth(<SideNavContent />, "passport_assessor_only", {
        initialRoute: "/passport/inbox",
      });

      await waitFor(() => {
        expect(screen.getByText("Sign-off requests")).toBeInTheDocument();
      });

      expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
    });

    it("hides Passport when the feature is on but the competency is missing", async () => {
      // The link asks both questions the route asks. Showing it on the
      // feature alone would offer a route that answers 404.
      renderWithAuth(<SideNavContent />, "passport_feature_only");

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });

      expect(screen.queryByText("Passport")).not.toBeInTheDocument();
    });

    it("hides Passport when the organisation does not have the feature", async () => {
      renderWithAuth(<SideNavContent />, "staff");

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });

      expect(screen.queryByText("Passport")).not.toBeInTheDocument();
    });
  });

  describe("Feedback under Admin", () => {
    it("offers it to somebody who operates Quill", async () => {
      renderWithAuth(<SideNavContent />, "superadmin", {
        initialRoute: "/admin",
      });

      // Two: this one under Admin, and the top-level link that opens the
      // modal.
      expect(await screen.findAllByText("Feedback")).toHaveLength(2);
    });

    it("hides it from an administrator who does not operate Quill", async () => {
      renderWithAuth(<SideNavContent />, "admin", { initialRoute: "/admin" });

      await screen.findByText("Admin");
      // Only the top-level link that opens the modal.
      expect(screen.getAllByText("Feedback")).toHaveLength(1);
    });
  });

  describe("Feedback link", () => {
    it.each(["staff", "patient", "staff_no_clinical", "superadmin"] as const)(
      "offers it to %s, ungated",
      async (userType) => {
        renderWithAuth(<SideNavContent />, userType);

        expect((await screen.findAllByText("Feedback")).length).toBeGreaterThan(
          0,
        );
      },
    );

    it("sits directly above Logout", async () => {
      renderWithAuth(<SideNavContent />, "admin");

      const feedback = await screen.findByText("Feedback");
      const logout = screen.getByText("Logout");
      expect(
        feedback.compareDocumentPosition(logout) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        feedback.closest("a, button")?.nextElementSibling?.textContent,
      ).toBe("Logout");
    });

    it("opens the feedback modal without calling onNavigate", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      renderWithAuth(<SideNavContent onNavigate={onNavigate} />);

      await user.click(await screen.findByText("Feedback"));

      expect(
        await screen.findByText("Do not include patient details."),
      ).toBeInTheDocument();
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });
});
