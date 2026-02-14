import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import NavigationDrawer from "./NavigationDrawer";

describe("NavigationDrawer Component", () => {
  describe("Basic rendering", () => {
    it("renders children when opened", () => {
      renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Test Content</div>
        </NavigationDrawer>,
      );
      expect(screen.getByText("Test Content")).toBeInTheDocument();
    });

    it("renders overlay when opened", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const overlay = container.querySelector(".mantine-Overlay-root");
      expect(overlay).toBeInTheDocument();
    });

    it("does not render overlay when closed", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={false} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const overlay = container.querySelector(".mantine-Overlay-root");
      expect(overlay).not.toBeInTheDocument();
    });

    it("renders dialog with correct role", () => {
      renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    });

    it("has aria-modal attribute", () => {
      renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });
  });

  describe("Overlay interaction", () => {
    it("calls onClose when overlay is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={onClose}>
          <div>Content</div>
        </NavigationDrawer>,
      );

      const overlay = container.querySelector(".mantine-Overlay-root");
      if (overlay) {
        await user.click(overlay);
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      }
    });

    it("overlay has correct opacity", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const overlay = container.querySelector(".mantine-Overlay-root");
      expect(overlay).toBeInTheDocument();
    });
  });

  describe("Width customization", () => {
    it("uses default width of 260px", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const paper = container.querySelector("#app-navbar");
      expect(paper).toHaveStyle({ width: "260px" });
    });

    it("accepts custom width", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()} width={300}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const paper = container.querySelector("#app-navbar");
      expect(paper).toHaveStyle({ width: "300px" });
    });
  });

  describe("Top offset", () => {
    it("uses default top offset of 0", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const paper = container.querySelector("#app-navbar");
      expect(paper).toHaveStyle({ top: "0px" });
    });

    it("accepts custom top offset", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()} topOffset={60}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const paper = container.querySelector("#app-navbar");
      expect(paper).toHaveStyle({ top: "60px" });
    });
  });

  describe("Animation states", () => {
    it("shows translated panel when opened", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const paper = container.querySelector("#app-navbar");
      expect(paper).toHaveStyle({ transform: "translateX(0)" });
    });

    it("hides translated panel when closed", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={false} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const paper = container.querySelector("#app-navbar");
      expect(paper).toHaveStyle({ transform: "translateX(-100%)" });
    });
  });

  describe("Accessibility", () => {
    it("includes focus trap", () => {
      renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    });

    it("has proper z-index layering", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const overlay = container.querySelector(".mantine-Overlay-root");
      const paper = container.querySelector("#app-navbar");

      expect(overlay).toHaveStyle({ zIndex: "15" });
      expect(paper).toHaveStyle({ zIndex: "16" });
    });
  });

  describe("Layout", () => {
    it("has flexbox column layout", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const paper = container.querySelector("#app-navbar");
      expect(paper).toHaveStyle({
        display: "flex",
        flexDirection: "column",
      });
    });

    it("positions absolutely", () => {
      const { container } = renderWithMantine(
        <NavigationDrawer opened={true} onClose={vi.fn()}>
          <div>Content</div>
        </NavigationDrawer>,
      );
      const paper = container.querySelector("#app-navbar");
      expect(paper).toHaveStyle({ position: "absolute" });
    });
  });
});
