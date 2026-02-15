/**
 * MainLayout Component Tests
 *
 * Tests for the main application layout including responsive behavior,
 * navigation drawer, patient display, and footer integration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import MainLayout from "./MainLayout";
import type { Patient } from "@/domains/patient";

// Mock child components
vi.mock("@components/drawers/NavigationDrawer", () => ({
  default: ({
    opened,
    onClose,
    children,
  }: {
    opened: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="navigation-drawer" data-opened={opened}>
      <button onClick={onClose}>Close Drawer</button>
      {children}
    </div>
  ),
}));

vi.mock("@components/navigation/SideNav", () => ({
  default: ({
    onNavigate,
    showSearch,
    showIcons,
  }: {
    onNavigate?: () => void;
    showSearch: boolean;
    showIcons?: boolean;
  }) => (
    <div
      data-testid="side-nav"
      data-show-search={showSearch}
      data-show-icons={showIcons}
    >
      <button onClick={onNavigate}>Navigate</button>
    </div>
  ),
}));

vi.mock("@components/ribbon/TopRibbon", () => ({
  default: ({
    onBurgerClick,
    isLoading,
    patient,
    navOpen,
    isNarrow,
  }: {
    onBurgerClick: () => void;
    isLoading: boolean;
    patient: Patient | null;
    navOpen: boolean;
    isNarrow: boolean;
  }) => (
    <div
      data-testid="top-ribbon"
      data-loading={isLoading}
      data-nav-open={navOpen}
      data-narrow={isNarrow}
    >
      <button onClick={onBurgerClick}>Burger Menu</button>
      {patient && <span>Patient: {patient.name}</span>}
    </div>
  ),
}));

vi.mock("@components/footer/Footer", () => ({
  default: ({
    text,
    loading,
    size,
  }: {
    text?: string;
    loading: boolean;
    size: string;
  }) => (
    <div data-testid="footer" data-loading={loading} data-size={size}>
      {text}
    </div>
  ),
}));

const mockPatient: Patient = {
  id: "1",
  name: "John Doe",
  nationalNumber: "ABC1234",
  dob: "1980-01-01",
  sex: "male",
};

// Mock auth context
const mockAuthContext = {
  state: {
    status: "authenticated" as const,
    user: {
      username: "doctor@example.com",
      system_permissions: "staff",
    },
  },
  login: vi.fn(),
  logout: vi.fn(),
  refreshAuth: vi.fn(),
};

vi.mock("@/auth/AuthContext", async () => {
  const actual = await vi.importActual("@/auth/AuthContext");
  return {
    ...actual,
    useAuth: () => mockAuthContext,
  };
});

describe("MainLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic rendering", () => {
    it("renders main layout structure", () => {
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Main Content</div>
        </MainLayout>,
      );

      expect(screen.getByTestId("top-ribbon")).toBeInTheDocument();
      expect(screen.getByTestId("navigation-drawer")).toBeInTheDocument();
      expect(screen.getByText("Main Content")).toBeInTheDocument();
      expect(screen.getByTestId("footer")).toBeInTheDocument();
    });

    it("renders patient information in ribbon", () => {
      renderWithMantine(
        <MainLayout patient={mockPatient}>
          <div>Content</div>
        </MainLayout>,
      );

      expect(
        screen.getByText(`Patient: ${mockPatient.name}`),
      ).toBeInTheDocument();
    });

    it("renders without patient when null", () => {
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      expect(screen.queryByText(/Patient:/)).not.toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("displays skeleton loaders when loading", () => {
      const { container } = renderWithMantine(
        <MainLayout patient={null} isLoading={true}>
          <div>This should not appear</div>
        </MainLayout>,
      );

      expect(
        screen.queryByText("This should not appear"),
      ).not.toBeInTheDocument();
      // Check for skeleton presence by looking for Stack container
      const stack = container.querySelector('[class*="Stack"]');
      expect(stack).toBeInTheDocument();
    });

    it("shows content when not loading", () => {
      renderWithMantine(
        <MainLayout patient={null} isLoading={false}>
          <div>Main Content Visible</div>
        </MainLayout>,
      );

      expect(screen.getByText("Main Content Visible")).toBeInTheDocument();
    });

    it("passes loading state to ribbon", () => {
      renderWithMantine(
        <MainLayout patient={null} isLoading={true}>
          <div>Content</div>
        </MainLayout>,
      );

      const ribbon = screen.getByTestId("top-ribbon");
      expect(ribbon).toHaveAttribute("data-loading", "true");
    });
  });

  describe("Navigation drawer interaction", () => {
    it("opens drawer when burger menu clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      const drawer = screen.getByTestId("navigation-drawer");
      expect(drawer).toHaveAttribute("data-opened", "false");

      await user.click(screen.getByText("Burger Menu"));

      await waitFor(() => {
        expect(drawer).toHaveAttribute("data-opened", "true");
      });
    });

    it("closes drawer when close button clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      // Open drawer first
      await user.click(screen.getByText("Burger Menu"));
      await waitFor(() => {
        expect(screen.getByTestId("navigation-drawer")).toHaveAttribute(
          "data-opened",
          "true",
        );
      });

      // Close drawer
      await user.click(screen.getByText("Close Drawer"));

      await waitFor(() => {
        expect(screen.getByTestId("navigation-drawer")).toHaveAttribute(
          "data-opened",
          "false",
        );
      });
    });

    it("closes drawer when navigation link clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      // Open drawer
      await user.click(screen.getByText("Burger Menu"));
      await waitFor(() => {
        expect(screen.getByTestId("navigation-drawer")).toHaveAttribute(
          "data-opened",
          "true",
        );
      });

      // Click navigate button in drawer
      const navigateButtons = screen.getAllByText("Navigate");
      await user.click(navigateButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId("navigation-drawer")).toHaveAttribute(
          "data-opened",
          "false",
        );
      });
    });
  });

  describe("Footer integration", () => {
    it("displays username in footer when authenticated", () => {
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      const footer = screen.getByTestId("footer");
      expect(footer.textContent).toContain("Logged in: doctor@example.com");
    });

    it("shows loading state in footer when auth is loading", () => {
      mockAuthContext.state = { status: "loading", user: null };

      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      const footer = screen.getByTestId("footer");
      expect(footer).toHaveAttribute("data-loading", "true");

      // Reset auth state
      mockAuthContext.state = {
        status: "authenticated",
        user: {
          username: "doctor@example.com",
          system_permissions: "staff",
        },
      };
    });

    it("passes correct size props to footer", () => {
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      const footer = screen.getByTestId("footer");
      expect(footer).toHaveAttribute("data-size");
    });
  });

  describe("Responsive behavior", () => {
    it("renders side navigation for desktop", () => {
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      const sideNavs = screen.getAllByTestId("side-nav");
      expect(sideNavs.length).toBeGreaterThan(0);
    });

    it("configures search visibility based on screen size", () => {
      renderWithMantine(
        <MainLayout patient={null}>
          <div>Content</div>
        </MainLayout>,
      );

      const sideNavs = screen.getAllByTestId("side-nav");
      // Desktop nav should have showSearch=false, mobile nav should have showSearch=true
      const hasDesktopNav = sideNavs.some(
        (nav) => nav.getAttribute("data-show-search") === "false",
      );
      expect(hasDesktopNav).toBe(true);
    });
  });

  describe("Content rendering", () => {
    it("renders children in main content area", () => {
      renderWithMantine(
        <MainLayout patient={null}>
          <div data-testid="custom-content">Custom Page Content</div>
        </MainLayout>,
      );

      expect(screen.getByTestId("custom-content")).toBeInTheDocument();
    });

    it("handles multiple child elements", () => {
      renderWithMantine(
        <MainLayout patient={null}>
          <div>First Element</div>
          <div>Second Element</div>
          <div>Third Element</div>
        </MainLayout>,
      );

      expect(screen.getByText("First Element")).toBeInTheDocument();
      expect(screen.getByText("Second Element")).toBeInTheDocument();
      expect(screen.getByText("Third Element")).toBeInTheDocument();
    });
  });
});
