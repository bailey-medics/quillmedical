/**
 * CompetencySummary Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CompetencySummary, { NO_FRAMEWORK_GROUP } from "./CompetencySummary";
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
      // A passport is not a defined set of competencies - membership is
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
      // for no information - which read as a flicker on every first
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

  describe("Grouped by framework", () => {
    const row = {
      status: "signed_off" as const,
      level: null,
      signed_on: "2026-03-14",
      signed_off_by: "Dr Amara Okonkwo",
      expires_on: null,
      sign_off: "2026-03-14-x",
      previous_sign_offs: [],
      logbook_entries: 0,
      certificates: [],
    };

    it("puts each competency under the framework it belongs to", () => {
      renderWithMantine(
        <CompetencySummary
          competencies={[
            { ...row, id: "perform_cannulation", name: "Insert a cannula" },
            {
              ...row,
              id: "uk_sact_board_2023_prescribe_sact",
              name: "Review and prescribe systemic anti-cancer therapy",
            },
          ]}
        />,
      );

      expect(screen.getByText("General clinical skills")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Prescriber competencies for reviewing and prescribing SACT",
        ),
      ).toBeInTheDocument();
    });

    it("keeps a competency in no framework, under its own heading", () => {
      // Retired from its framework since, or from a catalogue this
      // build no longer has. The record is the holder's all the same.
      renderWithMantine(
        <CompetencySummary
          competencies={[
            { ...row, id: "not_in_the_catalogue", name: "An older skill" },
          ]}
        />,
      );

      expect(screen.getByText(NO_FRAMEWORK_GROUP)).toBeInTheDocument();
      expect(screen.getByText("An older skill")).toBeInTheDocument();
    });
  });
});
