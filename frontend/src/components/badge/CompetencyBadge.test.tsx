import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import CompetencyBadge from "./CompetencyBadge";

describe("CompetencyBadge", () => {
  describe("Rendering", () => {
    it("displays the label text", () => {
      renderWithMantine(<CompetencyBadge label="Take Teaching Assessments" />);
      expect(screen.getByText("Take Teaching Assessments")).toBeInTheDocument();
    });

    it("renders as a badge element", () => {
      const { container } = renderWithMantine(
        <CompetencyBadge label="Manage Teaching Content" />,
      );
      const badge = container.querySelector(".mantine-Badge-root");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("Removed state", () => {
    it("renders removed badge with label", () => {
      renderWithMantine(
        <CompetencyBadge label="View Teaching Analytics" removed />,
      );
      expect(screen.getByText("View Teaching Analytics")).toBeInTheDocument();
    });
  });

  describe("Size prop", () => {
    it("renders with default size", () => {
      const { container } = renderWithMantine(<CompetencyBadge label="Test" />);
      const badge = container.querySelector(".mantine-Badge-root");
      expect(badge).toBeInTheDocument();
    });

    it("renders with custom size", () => {
      const { container } = renderWithMantine(
        <CompetencyBadge label="Test" size="sm" />,
      );
      const badge = container.querySelector(".mantine-Badge-root");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("renders skeleton when loading", () => {
      const { container } = renderWithMantine(
        <CompetencyBadge label="Test" isLoading />,
      );
      const skeleton = container.querySelector(".mantine-Skeleton-root");
      expect(skeleton).toBeInTheDocument();
    });

    it("does not render badge text when loading", () => {
      renderWithMantine(<CompetencyBadge label="Test" isLoading />);
      expect(screen.queryByText("Test")).not.toBeInTheDocument();
    });
  });
});
