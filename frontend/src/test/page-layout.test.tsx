/**
 * Page Layout Consistency Tests
 *
 * Ensures all pages follow the standard layout pattern with consistent max-width.
 * All pages should wrap content in <Container size="lg"> for 1140px max width.
 *
 * This test helps maintain visual consistency across the application and ensures
 * pages render correctly in Storybook with proper constraints.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { theme } from "@/theme";

// Import all page components
import Home from "@/pages/Home";
import Messages from "@/pages/Messages";
import Settings from "@/pages/Settings";
import AdminPatientsPage from "@/pages/admin/AdminPatientsPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminPermissionsPage from "@/pages/admin/AdminPermissionsPage";

// Mock dependencies
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    useOutletContext: () => ({ setPatient: vi.fn() }),
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

/**
 * Helper to render a page and check for Container with size="lg"
 */
function renderPageAndCheckContainer(PageComponent: React.ComponentType) {
  const { container } = render(
    <MantineProvider theme={theme}>
      <PageComponent />
    </MantineProvider>,
  );

  // Check for mantine-Container-root with data-size="lg"
  const containerElement = container.querySelector(
    '.mantine-Container-root[data-size="lg"]',
  );

  return containerElement;
}

describe("Page Layout Consistency", () => {
  describe("Container size='lg' requirement", () => {
    it("Home page uses Container size='lg'", () => {
      const containerElement = renderPageAndCheckContainer(Home);
      expect(containerElement).toBeInTheDocument();
    });

    it("Messages page uses Container size='lg'", () => {
      const containerElement = renderPageAndCheckContainer(Messages);
      expect(containerElement).toBeInTheDocument();
    });

    it("Settings page uses Container size='lg'", () => {
      const containerElement = renderPageAndCheckContainer(Settings);
      expect(containerElement).toBeInTheDocument();
    });

    it("AdminPatientsPage uses Container size='lg'", () => {
      const containerElement = renderPageAndCheckContainer(AdminPatientsPage);
      expect(containerElement).toBeInTheDocument();
    });

    it("AdminUsersPage uses Container size='lg'", () => {
      const containerElement = renderPageAndCheckContainer(AdminUsersPage);
      expect(containerElement).toBeInTheDocument();
    });

    it("AdminPermissionsPage uses Container size='lg'", () => {
      const containerElement =
        renderPageAndCheckContainer(AdminPermissionsPage);
      expect(containerElement).toBeInTheDocument();
    });
  });

  describe("Maximum width consistency", () => {
    it("all pages should have consistent max-width of 1140px", () => {
      const pages = [
        Home,
        Messages,
        Settings,
        AdminPatientsPage,
        AdminUsersPage,
        AdminPermissionsPage,
      ];

      pages.forEach((PageComponent) => {
        const { container } = render(
          <MantineProvider theme={theme}>
            <PageComponent />
          </MantineProvider>,
        );

        const containerElement = container.querySelector(
          '.mantine-Container-root[data-size="lg"]',
        );

        // Container should exist with size="lg" attribute
        expect(containerElement).toBeInTheDocument();
        expect(containerElement).toHaveAttribute("data-size", "lg");
      });
    });
  });
});
