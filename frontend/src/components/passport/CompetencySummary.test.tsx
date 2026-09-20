/**
 * CompetencySummary Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CompetencySummary from "./CompetencySummary";
import { competencies } from "./fixtures";

describe("CompetencySummary", () => {
  describe("Content", () => {
    it("renders a row per competency", () => {
      renderWithMantine(<CompetencySummary competencies={competencies} />);
      expect(screen.getAllByTestId("competency-row")).toHaveLength(3);
    });

    it("renders the default heading", () => {
      renderWithMantine(<CompetencySummary competencies={competencies} />);
      expect(screen.getByText("Competencies")).toBeInTheDocument();
    });

    it("accepts a different heading", () => {
      renderWithMantine(
        <CompetencySummary competencies={competencies} title="SACT passport" />,
      );
      expect(screen.getByText("SACT passport")).toBeInTheDocument();
    });
  });

  describe("Counts, never totals", () => {
    it("shows no denominator, percentage or progress bar", () => {
      // A passport is not a defined set of competencies — membership is
      // local policy, so a denominator would invent one.
      renderWithMantine(<CompetencySummary competencies={competencies} />);
      expect(screen.queryByText(/of 3/)).not.toBeInTheDocument();
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("does not report how many are complete", () => {
      renderWithMantine(<CompetencySummary competencies={competencies} />);
      expect(screen.queryByText(/complete/i)).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("explains what would make a competency appear", () => {
      renderWithMantine(<CompetencySummary competencies={[]} />);
      expect(screen.getByText("No competencies yet")).toBeInTheDocument();
    });

    it("renders no rows", () => {
      renderWithMantine(<CompetencySummary competencies={[]} />);
      expect(screen.queryByTestId("competency-row")).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows the message straight away, without a loading pass", () => {
      // There was a loading state here, showing three grey bars that
      // were then replaced by this fixed message. The words are the
      // same whatever the fetch returns, so the panel changed shape
      // for no information — which read as a flicker on every first
      // visit.
      renderWithMantine(<CompetencySummary competencies={[]} />);

      expect(screen.getByText("No competencies yet")).toBeInTheDocument();
    });
  });

  describe("Selection", () => {
    it("passes the chosen competency id up", async () => {
      const onSelect = vi.fn();
      renderWithMantine(
        <CompetencySummary competencies={competencies} onSelect={onSelect} />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Perform bronchoscopy" }),
      );

      expect(onSelect).toHaveBeenCalledWith("perform_bronchoscopy");
    });
  });
});
