/**
 * AssessmentResultBadge Component Tests
 *
 * Tests for the AssessmentResultBadge component covering:
 * - All three result states (pass, fail, incomplete)
 * - Different size variants
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import AssessmentResultBadge from "./AssessmentResultBadge";

describe("AssessmentResultBadge", () => {
  describe("Result states", () => {
    it("renders 'Pass' for pass result", () => {
      renderWithMantine(<AssessmentResultBadge result="pass" />);
      expect(screen.getByText("Pass")).toBeInTheDocument();
    });

    it("renders 'Fail' for fail result", () => {
      renderWithMantine(<AssessmentResultBadge result="fail" />);
      expect(screen.getByText("Fail")).toBeInTheDocument();
    });

    it("renders 'Incomplete' for incomplete result", () => {
      renderWithMantine(<AssessmentResultBadge result="incomplete" />);
      expect(screen.getByText("Incomplete")).toBeInTheDocument();
    });
  });

  describe("Exclusivity", () => {
    it("does not render other labels when pass", () => {
      renderWithMantine(<AssessmentResultBadge result="pass" />);
      expect(screen.queryByText("Fail")).not.toBeInTheDocument();
      expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
    });

    it("does not render other labels when fail", () => {
      renderWithMantine(<AssessmentResultBadge result="fail" />);
      expect(screen.queryByText("Pass")).not.toBeInTheDocument();
      expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
    });

    it("does not render other labels when incomplete", () => {
      renderWithMantine(<AssessmentResultBadge result="incomplete" />);
      expect(screen.queryByText("Pass")).not.toBeInTheDocument();
      expect(screen.queryByText("Fail")).not.toBeInTheDocument();
    });
  });

  describe("Size variants", () => {
    it("renders with default lg size", () => {
      renderWithMantine(<AssessmentResultBadge result="pass" />);
      expect(screen.getByText("Pass")).toBeInTheDocument();
    });

    it("renders with md size", () => {
      renderWithMantine(<AssessmentResultBadge result="pass" size="md" />);
      expect(screen.getByText("Pass")).toBeInTheDocument();
    });

    it("renders with lg size", () => {
      renderWithMantine(<AssessmentResultBadge result="fail" size="lg" />);
      expect(screen.getByText("Fail")).toBeInTheDocument();
    });

    it("renders with xl size", () => {
      renderWithMantine(
        <AssessmentResultBadge result="incomplete" size="xl" />,
      );
      expect(screen.getByText("Incomplete")).toBeInTheDocument();
    });
  });
});
