/**
 * CompetencyRow Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CompetencyRow from "./CompetencyRow";
import { requestedCompetency, signedOffCompetency } from "./fixtures";

describe("CompetencyRow", () => {
  describe("Content", () => {
    it("renders the competency name", () => {
      renderWithMantine(<CompetencyRow competency={signedOffCompetency} />);
      expect(screen.getByText("Perform bronchoscopy")).toBeInTheDocument();
    });

    it("renders the current level when the competency has one", () => {
      renderWithMantine(<CompetencyRow competency={signedOffCompetency} />);
      expect(screen.getByText("Can perform independently")).toBeInTheDocument();
    });

    it("names the assessor and the date signed", () => {
      renderWithMantine(<CompetencyRow competency={signedOffCompetency} />);
      expect(screen.getByText(/Dr Amara Okonkwo/)).toBeInTheDocument();
    });

    it("shows a review date without acting on it", () => {
      renderWithMantine(<CompetencyRow competency={signedOffCompetency} />);
      // Reported and nothing more: what a lapsed sign-off implies is a
      // clinical decision that has not been made.
      expect(screen.getByText(/Review due/)).toBeInTheDocument();
      expect(screen.queryByText(/Expired/i)).not.toBeInTheDocument();
    });

    it("renders the status badge", () => {
      renderWithMantine(<CompetencyRow competency={signedOffCompetency} />);
      expect(screen.getByText("Signed off")).toBeInTheDocument();
    });
  });

  describe("Counts, never comparisons", () => {
    it("reports the logbook count", () => {
      renderWithMantine(<CompetencyRow competency={signedOffCompetency} />);
      expect(screen.getByText(/38 logbook entries/)).toBeInTheDocument();
    });

    it("never renders a target, a denominator or a percentage", () => {
      renderWithMantine(<CompetencyRow competency={signedOffCompetency} />);
      expect(screen.queryByText(/of \d+/)).not.toBeInTheDocument();
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("reads 'entry' rather than 'entries' for a count of one", () => {
      renderWithMantine(
        <CompetencyRow
          competency={{ ...signedOffCompetency, logbook_entries: 1 }}
        />,
      );
      expect(screen.getByText(/1 logbook entry/)).toBeInTheDocument();
    });

    it("omits the count entirely when there are no entries", () => {
      renderWithMantine(
        <CompetencyRow
          competency={{ ...signedOffCompetency, logbook_entries: 0 }}
        />,
      );
      expect(screen.queryByText(/logbook/)).not.toBeInTheDocument();
    });
  });

  describe("Optional fields", () => {
    it("omits level, assessor and expiry when the competency has none", () => {
      renderWithMantine(<CompetencyRow competency={requestedCompetency} />);
      expect(screen.queryByText(/Signed off by/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Review due/)).not.toBeInTheDocument();
      expect(screen.getByText("Requested")).toBeInTheDocument();
    });

    it("shows no badge when nothing has been signed or asked for", () => {
      // The API sends `requested` for a competency that only has a
      // logbook entry against it, as the nearest of its four statuses
      // to "evidence here, nobody has assessed it". As a badge that
      // reads as a claim an assessor was asked, which nobody was.
      renderWithMantine(
        <CompetencyRow
          competency={{ ...requestedCompetency, sign_off: null }}
        />,
      );

      expect(screen.queryByText("Requested")).not.toBeInTheDocument();
      expect(
        screen.getByText("Perform thoracic ultrasound"),
      ).toBeInTheDocument();
    });
  });

  describe("Selection", () => {
    it("is not a button when no handler is given", () => {
      renderWithMantine(<CompetencyRow competency={signedOffCompetency} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("calls onSelect with the competency id", async () => {
      const onSelect = vi.fn();
      renderWithMantine(
        <CompetencyRow competency={signedOffCompetency} onSelect={onSelect} />,
      );

      await userEvent.click(screen.getByRole("button"));

      expect(onSelect).toHaveBeenCalledWith("perform_bronchoscopy");
    });
  });
});
