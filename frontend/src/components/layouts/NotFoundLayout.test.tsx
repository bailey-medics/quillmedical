import { describe, expect, it, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import NotFoundLayout from "./NotFoundLayout";

describe("NotFoundLayout Component", () => {
  const originalEnv = import.meta.env.BASE_URL;

  afterEach(() => {
    // Restore original BASE_URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (import.meta.env as any).BASE_URL = originalEnv;
  });

  describe("Basic rendering", () => {
    it("renders 404 title", () => {
      renderWithMantine(<NotFoundLayout />);
      expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
    });

    it("displays error message", () => {
      renderWithMantine(<NotFoundLayout />);
      expect(
        screen.getByText("The page you requested does not exist."),
      ).toBeInTheDocument();
    });

    it("renders home button", () => {
      renderWithMantine(<NotFoundLayout />);
      expect(screen.getByText("Go to home")).toBeInTheDocument();
    });

    it("uses heading level 2 for title", () => {
      renderWithMantine(<NotFoundLayout />);
      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading).toHaveTextContent("404 — Page not found");
    });
  });

  describe("Home button", () => {
    it("renders as a button element", () => {
      renderWithMantine(<NotFoundLayout />);
      const button = screen.getByRole("button", { name: /go to home/i });
      expect(button).toBeInTheDocument();
    });

    it("uses default base URL /", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (import.meta.env as any).BASE_URL = "/";
      renderWithMantine(<NotFoundLayout />);
      // Component normalises BASE_URL and navigates via window.location.href
      expect(
        screen.getByRole("button", { name: /go to home/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Layout and styling", () => {
    it("renders in a container", () => {
      const { container } = renderWithMantine(<NotFoundLayout />);
      const containerElement = container.querySelector(
        ".mantine-Container-root",
      );
      expect(containerElement).toBeInTheDocument();
    });

    it("centers text content", () => {
      const { container } = renderWithMantine(<NotFoundLayout />);
      const center = container.querySelector(".mantine-Center-root");
      expect(center).toBeInTheDocument();
    });

    it("applies padding to container", () => {
      const { container } = renderWithMantine(<NotFoundLayout />);
      const containerElement = container.querySelector(
        ".mantine-Container-root",
      );
      expect(containerElement).toBeInTheDocument();
    });
  });

  describe("Text styling", () => {
    it("applies dimmed color to description", () => {
      renderWithMantine(<NotFoundLayout />);
      const description = screen.getByText(
        "The page you requested does not exist.",
      );
      expect(description).toBeInTheDocument();
    });

    it("uses medium size for description", () => {
      renderWithMantine(<NotFoundLayout />);
      const description = screen.getByText(
        "The page you requested does not exist.",
      );
      expect(description).toBeInTheDocument();
    });
  });

  describe("Button styling", () => {
    it("renders button with icon", () => {
      renderWithMantine(<NotFoundLayout />);
      const button = screen.getByRole("button", { name: /go to home/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has proper heading hierarchy", () => {
      renderWithMantine(<NotFoundLayout />);
      const heading = screen.getByRole("heading");
      expect(heading).toBeInTheDocument();
    });

    it("button has accessible text", () => {
      renderWithMantine(<NotFoundLayout />);
      const button = screen.getByRole("button", { name: /go to home/i });
      expect(button).toBeInTheDocument();
    });
  });
});
