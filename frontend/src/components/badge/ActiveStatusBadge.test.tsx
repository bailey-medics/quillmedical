/**
 * ActiveStatus Badge Component Tests
 *
 * Tests for the ActiveStatus component covering:
 * - Rendering active status
 * - Rendering deactivated status
 * - Correct colour application
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import ActiveStatusBadge from "./ActiveStatusBadge";

describe("ActiveStatusBadge", () => {
  describe("Active state", () => {
    it("renders 'Active' text when active is true", () => {
      renderWithMantine(<ActiveStatusBadge active={true} />);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("does not render 'Deactivated' when active is true", () => {
      renderWithMantine(<ActiveStatusBadge active={true} />);
      expect(screen.queryByText("Deactivated")).not.toBeInTheDocument();
    });
  });

  describe("Deactivated state", () => {
    it("renders 'Deactivated' text when active is false", () => {
      renderWithMantine(<ActiveStatusBadge active={false} />);
      expect(screen.getByText("Deactivated")).toBeInTheDocument();
    });

    it("does not render 'Active' when active is false", () => {
      renderWithMantine(<ActiveStatusBadge active={false} />);
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
    });
  });

  describe("Boolean edge cases", () => {
    it("handles explicit true value", () => {
      renderWithMantine(<ActiveStatusBadge active={true} />);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("handles explicit false value", () => {
      renderWithMantine(<ActiveStatusBadge active={false} />);
      expect(screen.getByText("Deactivated")).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("shows skeleton when loading", () => {
      const { container } = renderWithMantine(
        <ActiveStatusBadge active={true} isLoading />,
      );
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
      expect(
        container.querySelector(".mantine-Skeleton-root"),
      ).toBeInTheDocument();
    });
  });
});
