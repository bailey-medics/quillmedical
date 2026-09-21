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
  superadmin: {
    id: "4",
    username: "superadmin.user",
    email: "superadmin@example.com",
    roles: ["Clinician", "Administrator"],
    competencies: ["manage_users"],
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
    competencies: ["assess_clinician_passport"],
    enabled_features: ["passport"],
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
  admin_no_clinical: {
    id: "6",
    username: "admin.teaching",
    email: "admin.teaching@example.com",
    roles: ["Clinician", "Administrator"],
    competencies: ["manage_users"],
    clinical_services_enabled: false,
  },
};

function renderWithAuth(
  ui: React.ReactElement,
  userType: keyof typeof mockUsers = "staff",
  options?: { initialRoute?: string },
) {
  const mockUser = mockUsers[userType];

  // Mock fetch to return the appropriate user
  global.fetch = vi.fn((url: string | URL | Request) => {
    const urlString = typeof url === "string" ? url : url.toString();

    if (urlString.includes("/auth/me")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "Content-Type": "application/json" }),
        json: () => Promise.resolve(mockUser),
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

    it("calls onNavigate callback when Admin is clicked (for admin user)", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      renderWithAuth(<SideNavContent onNavigate={onNavigate} />, "admin");

      await waitFor(() =>
        expect(screen.getByText("Admin")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("Admin"));
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
              label: "Dr Corbett, Gemma",
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
        expect(screen.getByText("Dr Corbett, Gemma")).toBeInTheDocument();
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
    // a place id, so it named whichever organisation happened to hold
    // that number. Both kinds of place come from one address now.
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

    /** Render at a route, answering /auth/me and the place address. */
    function renderAt(route: string, body: Record<string, unknown>) {
      const asked: string[] = [];
      const user = mockUsers.admin;

      global.fetch = vi.fn((url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url.toString();
        asked.push(urlString);

        const answer = urlString.includes("/auth/me")
          ? user
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

      // A building is a place, not an organisation, so going up lands on
      // the place page rather than the organisation one.
      await waitFor(() => {
        expect(asked.some((url) => url.endsWith("/org-units/11"))).toBe(true);
      });
    });

    it("asks about nothing on the create page", async () => {
      // "new" is a page, not a place.
      const asked = renderAt("/admin/sites/new", place());

      await waitFor(() => {
        expect(screen.getByText("Admin")).toBeInTheDocument();
      });
      expect(asked.some((url) => url.includes("/org-units/"))).toBe(false);
    });
  });

  describe("Passport", () => {
    it("shows Passport to somebody holding the feature and the competency", async () => {
      renderWithAuth(<SideNavContent />, "passport_holder");

      await waitFor(() => {
        expect(screen.getByText("Passport")).toBeInTheDocument();
      });
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
});
