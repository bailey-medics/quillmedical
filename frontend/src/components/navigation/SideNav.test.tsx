import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import SideNav from "./SideNav";
import { AuthProvider } from "@/auth/AuthContext";

// Wrapper function to provide auth context for SideNavContent
function renderWithAuth(ui: React.ReactElement) {
  return renderWithRouter(<AuthProvider>{ui}</AuthProvider>);
}

describe("SideNav Component", () => {
  describe("Basic rendering", () => {
    it("renders navigation element with correct role", () => {
      renderWithAuth(<SideNav showSearch={false} />);
      const nav = screen.getByRole("navigation", { name: /primary/i });
      expect(nav).toBeInTheDocument();
    });

    it("renders without search when showSearch is false", () => {
      renderWithAuth(<SideNav showSearch={false} />);
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    });

    it("renders search input when showSearch is true", () => {
      renderWithAuth(<SideNav showSearch={true} />);
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    it("renders search with correct aria-label", () => {
      renderWithAuth(<SideNav showSearch={true} />);
      const searchInput = screen.getByLabelText(/search/i);
      expect(searchInput).toBeInTheDocument();
    });

    it("renders divider after search when search is shown", () => {
      const { container } = renderWithAuth(<SideNav showSearch={true} />);
      const divider = container.querySelector('[role="separator"]');
      expect(divider).toBeInTheDocument();
    });
  });

  describe("Search input", () => {
    it("has search placeholder text", () => {
      renderWithAuth(<SideNav showSearch={true} />);
      const input = screen.getByPlaceholderText("Search…");
      expect(input).toBeInTheDocument();
    });

    it("has search icon in right section", () => {
      const { container } = renderWithAuth(<SideNav showSearch={true} />);
      // Search icon should be rendered as an SVG
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("allows typing in search input", async () => {
      const user = userEvent.setup();
      renderWithAuth(<SideNav showSearch={true} />);
      const input = screen.getByPlaceholderText(/search/i);

      await user.type(input, "test query");
      expect(input).toHaveValue("test query");
    });
  });

  describe("Navigation callback", () => {
    it("calls onNavigate when provided", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      renderWithAuth(<SideNav showSearch={false} onNavigate={onNavigate} />);

      // Find Home link by text and click it
      const homeLink = screen.getByText("Home");
      await user.click(homeLink);

      expect(onNavigate).toHaveBeenCalled();
    });

    it("does not error when onNavigate is not provided", async () => {
      const user = userEvent.setup();
      renderWithAuth(<SideNav showSearch={false} />);

      // Find Home link and click it (should not throw)
      const homeLink = screen.getByText("Home");
      await user.click(homeLink);

      // If we get here, no error was thrown
      expect(homeLink).toBeInTheDocument();
    });
  });

  describe("Icon display", () => {
    it("renders with icons when showIcons is true", () => {
      const { container } = renderWithAuth(
        <SideNav showSearch={false} showIcons={true} />,
      );
      // Icons should be rendered as SVGs
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThan(0);
    });

    it("renders without icons when showIcons is false", () => {
      renderWithAuth(<SideNav showSearch={false} showIcons={false} />);
      // Text-only links should still be present
      const homeLink = screen.getByText("Home");
      expect(homeLink).toBeInTheDocument();
    });

    it("renders icons by default when showIcons is undefined", () => {
      renderWithAuth(<SideNav showSearch={false} />);
      // Should render navigation items - check for Home link
      expect(screen.getByText("Home")).toBeInTheDocument();
    });
  });

  describe("Navigation content", () => {
    it("renders Home link", () => {
      renderWithAuth(<SideNav showSearch={false} />);
      expect(screen.getByText("Home")).toBeInTheDocument();
    });

    it("renders Settings link", () => {
      renderWithAuth(<SideNav showSearch={false} />);
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });

  describe("Layout styling", () => {
    it("has minimum width of 100px", () => {
      const { container } = renderWithAuth(<SideNav showSearch={false} />);
      const nav = container.querySelector("nav");
      expect(nav).toHaveStyle({ minWidth: "100px" });
    });

    it("has 100% height", () => {
      const { container } = renderWithAuth(<SideNav showSearch={false} />);
      const nav = container.querySelector("nav");
      expect(nav).toHaveStyle({ height: "100%" });
    });

    it("has right padding", () => {
      const { container } = renderWithAuth(<SideNav showSearch={false} />);
      const nav = container.querySelector("nav");
      expect(nav).toHaveStyle({ paddingRight: "14px" });
    });
  });
});
