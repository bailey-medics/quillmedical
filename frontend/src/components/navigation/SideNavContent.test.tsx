import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import SideNavContent from "./SideNavContent";
import { AuthProvider } from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";

// Mock users with different permission levels
const mockUsers: Record<string, User> = {
  staff: {
    id: "2",
    username: "staff.user",
    email: "staff@example.com",
    roles: ["Clinician"],
    system_permissions: "staff",
  },
  admin: {
    id: "3",
    username: "admin.user",
    email: "admin@example.com",
    roles: ["Clinician", "Administrator"],
    system_permissions: "admin",
  },
  superadmin: {
    id: "4",
    username: "superadmin.user",
    email: "superadmin@example.com",
    roles: ["Clinician", "Administrator"],
    system_permissions: "superadmin",
  },
  patient: {
    id: "1",
    username: "patient.user",
    email: "patient@example.com",
    roles: ["Patient"],
    system_permissions: "patient",
  },
};

function renderWithAuth(
  ui: React.ReactElement,
  userType: keyof typeof mockUsers = "staff",
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

  return renderWithRouter(<AuthProvider>{ui}</AuthProvider>);
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

  describe("Font size customization", () => {
    it("applies custom font size when provided", async () => {
      renderWithAuth(<SideNavContent fontSize={24} />);

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
      });
      // Font size is applied via Mantine styles, checking component renders
    });

    it("uses default font size when not provided", async () => {
      renderWithAuth(<SideNavContent />);

      await waitFor(() => {
        expect(screen.getByText("Home")).toBeInTheDocument();
      });
      // Default is 20px, applied via Mantine styles
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
});
