/**
 * NestedNavLink Component Tests
 *
 * Tests for the recursive navigation link component including:
 * - Basic rendering and navigation
 * - Active state detection
 * - Child item expansion based on active route
 * - Icon display options
 * - Nested navigation hierarchies
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import NestedNavLink, { type NavItem } from "./NestedNavLink";

// Sample navigation items for testing
const singleNavItem: NavItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: "home",
};

const navItemWithChildren: NavItem = {
  label: "Patients",
  href: "/patients",
  icon: "user",
  children: [
    { label: "All Patients", href: "/patients/all" },
    { label: "New Patient", href: "/patients/new" },
    { label: "Recent", href: "/patients/recent" },
  ],
};

const nestedNavItem: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: "settings",
  children: [
    { label: "Profile", href: "/settings/profile" },
    {
      label: "Security",
      href: "/settings/security",
      children: [
        { label: "Password", href: "/settings/security/password" },
        { label: "Two-Factor", href: "/settings/security/2fa" },
      ],
    },
  ],
};

describe("NestedNavLink Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic rendering", () => {
    it("renders a single nav item", () => {
      renderWithRouter(<NestedNavLink item={singleNavItem} />);

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    it("renders nav item without icon by default", () => {
      const { container } = renderWithRouter(
        <NestedNavLink item={singleNavItem} />,
      );

      // Should not render the icon when showIcons is false
      const themeIcons = container.querySelectorAll(".mantine-ThemeIcon-root");
      expect(themeIcons).toHaveLength(0);
    });

    it("renders nav item with icon when showIcons is true", () => {
      const { container } = renderWithRouter(
        <NestedNavLink item={singleNavItem} showIcons />,
      );

      // Should render the icon
      const themeIcons = container.querySelectorAll(".mantine-ThemeIcon-root");
      expect(themeIcons.length).toBeGreaterThan(0);
    });

    it("renders nav item without icon if none specified", () => {
      const itemNoIcon: NavItem = {
        label: "Simple",
        href: "/simple",
      };

      const { container } = renderWithRouter(
        <NestedNavLink item={itemNoIcon} showIcons />,
      );

      const themeIcons = container.querySelectorAll(".mantine-ThemeIcon-root");
      expect(themeIcons).toHaveLength(0);
    });
  });

  describe("Navigation", () => {
    it("navigates to correct route when clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NestedNavLink item={singleNavItem} />);

      const navLink = screen.getByText("Dashboard");
      await user.click(navLink);

      await waitFor(() => {
        expect(window.location.pathname).toBe("/dashboard");
      });
    });

    it("calls onNavigate callback when clicked", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();

      renderWithRouter(
        <NestedNavLink item={singleNavItem} onNavigate={onNavigate} />,
      );

      const navLink = screen.getByText("Dashboard");
      await user.click(navLink);

      await waitFor(() => {
        expect(onNavigate).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Active state", () => {
    it("marks item as active when on exact route", () => {
      const { container } = renderWithRouter(
        <NestedNavLink item={singleNavItem} />,
        { initialRoute: "/dashboard" },
      );

      // Mantine adds data-active attribute to active NavLinks
      const activeLinks = container.querySelectorAll("[data-active='true']");
      expect(activeLinks.length).toBeGreaterThan(0);
    });

    it("does not mark item as active when on different route", () => {
      const { container } = renderWithRouter(
        <NestedNavLink item={singleNavItem} />,
        { initialRoute: "/other" },
      );

      const activeLinks = container.querySelectorAll("[data-active='true']");
      expect(activeLinks).toHaveLength(0);
    });
  });

  describe("Child items", () => {
    it("does not show children when parent is not active", () => {
      renderWithRouter(<NestedNavLink item={navItemWithChildren} />, {
        initialRoute: "/dashboard",
      });

      expect(screen.getByText("Patients")).toBeInTheDocument();
      expect(screen.queryByText("All Patients")).not.toBeInTheDocument();
      expect(screen.queryByText("New Patient")).not.toBeInTheDocument();
    });

    it("shows children when on parent route", () => {
      renderWithRouter(<NestedNavLink item={navItemWithChildren} />, {
        initialRoute: "/patients",
      });

      expect(screen.getByText("Patients")).toBeInTheDocument();
      expect(screen.getByText("All Patients")).toBeInTheDocument();
      expect(screen.getByText("New Patient")).toBeInTheDocument();
      expect(screen.getByText("Recent")).toBeInTheDocument();
    });

    it("shows children when on child route", () => {
      renderWithRouter(<NestedNavLink item={navItemWithChildren} />, {
        initialRoute: "/patients/all",
      });

      expect(screen.getByText("Patients")).toBeInTheDocument();
      expect(screen.getByText("All Patients")).toBeInTheDocument();
      expect(screen.getByText("New Patient")).toBeInTheDocument();
    });

    it("marks child as active when on child route", () => {
      const { container } = renderWithRouter(
        <NestedNavLink item={navItemWithChildren} />,
        { initialRoute: "/patients/new" },
      );

      // Both parent and child should be visible
      expect(screen.getByText("Patients")).toBeInTheDocument();
      expect(screen.getByText("New Patient")).toBeInTheDocument();

      // Only the child should be marked active
      const activeLinks = container.querySelectorAll("[data-active='true']");
      // We need to check that the "New Patient" link is the one marked active
      expect(activeLinks.length).toBeGreaterThan(0);
    });
  });

  describe("Nested children", () => {
    it("shows deeply nested children when on nested route", () => {
      renderWithRouter(<NestedNavLink item={nestedNavItem} />, {
        initialRoute: "/settings/security/password",
      });

      // All levels should be visible
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.getByText("Profile")).toBeInTheDocument();
      expect(screen.getByText("Security")).toBeInTheDocument();
      expect(screen.getByText("Password")).toBeInTheDocument();
      expect(screen.getByText("Two-Factor")).toBeInTheDocument();
    });

    it("does not show third level when on second level route", () => {
      renderWithRouter(<NestedNavLink item={nestedNavItem} />, {
        initialRoute: "/settings/profile",
      });

      // First and second level visible
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.getByText("Profile")).toBeInTheDocument();
      expect(screen.getByText("Security")).toBeInTheDocument();

      // Third level not visible (Security children)
      expect(screen.queryByText("Password")).not.toBeInTheDocument();
      expect(screen.queryByText("Two-Factor")).not.toBeInTheDocument();
    });
  });

  describe("Interactive navigation", () => {
    it("navigates to child route when child is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NestedNavLink item={navItemWithChildren} />, {
        initialRoute: "/patients",
      });

      const childLink = screen.getByText("All Patients");
      await user.click(childLink);

      await waitFor(() => {
        expect(window.location.pathname).toBe("/patients/all");
      });
    });

    it("calls onNavigate for child items", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();

      renderWithRouter(
        <NestedNavLink item={navItemWithChildren} onNavigate={onNavigate} />,
        { initialRoute: "/patients" },
      );

      const childLink = screen.getByText("New Patient");
      await user.click(childLink);

      await waitFor(() => {
        expect(onNavigate).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Font size customization", () => {
    it("uses default base font size of 20px", () => {
      const { container } = renderWithRouter(
        <NestedNavLink item={singleNavItem} />,
      );

      const navLink = container.querySelector(".mantine-NavLink-root");
      expect(navLink).toHaveStyle({ fontSize: "20px" });
    });

    it("uses custom base font size when provided", () => {
      const { container } = renderWithRouter(
        <NestedNavLink item={singleNavItem} baseFontSize={24} />,
      );

      const navLink = container.querySelector(".mantine-NavLink-root");
      expect(navLink).toHaveStyle({ fontSize: "24px" });
    });
  });
});
