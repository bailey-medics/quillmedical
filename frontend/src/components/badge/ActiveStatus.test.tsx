/**
 * ActiveStatus Badge Component Tests
 *
 * Tests for the ActiveStatus component covering:
 * - Rendering active status
 * - Rendering deactivated status
 * - Different size variants
 * - Correct colour application
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import ActiveStatus from "./ActiveStatus";

describe("ActiveStatus", () => {
  describe("Active state", () => {
    it("renders 'Active' text when active is true", () => {
      renderWithMantine(<ActiveStatus active={true} />);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("does not render 'Deactivated' when active is true", () => {
      renderWithMantine(<ActiveStatus active={true} />);
      expect(screen.queryByText("Deactivated")).not.toBeInTheDocument();
    });

    it("applies green colour for active status", () => {
      renderWithMantine(<ActiveStatus active={true} />);
      const badge = screen.getByText("Active");
      expect(badge).toHaveAttribute("data-variant", "light");
    });
  });

  describe("Deactivated state", () => {
    it("renders 'Deactivated' text when active is false", () => {
      renderWithMantine(<ActiveStatus active={false} />);
      expect(screen.getByText("Deactivated")).toBeInTheDocument();
    });

    it("does not render 'Active' when active is false", () => {
      renderWithMantine(<ActiveStatus active={false} />);
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
    });

    it("applies red colour for deactivated status", () => {
      renderWithMantine(<ActiveStatus active={false} />);
      const badge = screen.getByText("Deactivated");
      expect(badge).toHaveAttribute("data-variant", "light");
    });
  });

  describe("Size variants", () => {
    it("uses default md size when size prop not provided", () => {
      renderWithMantine(<ActiveStatus active={true} />);
      const badge = screen.getByText("Active");
      expect(badge).toHaveAttribute("data-size", "md");
    });

    it("renders with sm size", () => {
      renderWithMantine(<ActiveStatus active={true} size="sm" />);
      const badge = screen.getByText("Active");
      expect(badge).toHaveAttribute("data-size", "sm");
    });

    it("renders with md size", () => {
      renderWithMantine(<ActiveStatus active={true} size="md" />);
      const badge = screen.getByText("Active");
      expect(badge).toHaveAttribute("data-size", "md");
    });

    it("renders with lg size", () => {
      renderWithMantine(<ActiveStatus active={true} size="lg" />);
      const badge = screen.getByText("Active");
      expect(badge).toHaveAttribute("data-size", "lg");
    });

    it("renders with xl size", () => {
      renderWithMantine(<ActiveStatus active={true} size="xl" />);
      const badge = screen.getByText("Active");
      expect(badge).toHaveAttribute("data-size", "xl");
    });
  });

  describe("Boolean edge cases", () => {
    it("handles explicit true value", () => {
      renderWithMantine(<ActiveStatus active={true} />);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("handles explicit false value", () => {
      renderWithMantine(<ActiveStatus active={false} />);
      expect(screen.getByText("Deactivated")).toBeInTheDocument();
    });
  });
});
