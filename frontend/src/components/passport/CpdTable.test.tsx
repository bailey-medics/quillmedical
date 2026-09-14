/**
 * CpdTable Component Tests
 *
 * Most of these guard the rule that every total states the range it
 * covers — the thing that stops an honest short period reading as a poor
 * year.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CpdTable from "./CpdTable";
import { cpdEntries, appraisalPeriod, shortAppraisalPeriod } from "./fixtures";

describe("CpdTable", () => {
  describe("The period is always stated", () => {
    it("renders the declared range rather than a bare year", () => {
      renderWithMantine(
        <CpdTable entries={cpdEntries} period={appraisalPeriod} />,
      );
      expect(screen.getByText(/1 Aug 2025/)).toBeInTheDocument();
      expect(screen.getByText(/31 Jul 2026/)).toBeInTheDocument();
    });

    it("renders a short period's real dates, not a year label", () => {
      // A short period must be visibly short: the same points across
      // four months is a different record from twelve.
      renderWithMantine(
        <CpdTable entries={cpdEntries} period={shortAppraisalPeriod} />,
      );
      expect(screen.getByText(/30 Nov 2026/)).toBeInTheDocument();
    });

    it("names the fallback as a convention when no period is declared", () => {
      renderWithMantine(<CpdTable entries={cpdEntries} />);
      expect(
        screen.getByText(/June to June — you have not set an appraisal period/),
      ).toBeInTheDocument();
    });
  });

  describe("The total", () => {
    it("sums the points", () => {
      // 6 + 3 + 2.5, with one entry carrying none.
      renderWithMantine(
        <CpdTable entries={cpdEntries} period={appraisalPeriod} />,
      );
      expect(screen.getByText("11.5 points")).toBeInTheDocument();
    });

    it("counts every activity, including those claiming no points", () => {
      renderWithMantine(
        <CpdTable entries={cpdEntries} period={appraisalPeriod} />,
      );
      expect(screen.getByText(/across 4 activities/)).toBeInTheDocument();
    });

    it("shows no target, denominator or progress", () => {
      // Arithmetic over what the holder claimed is legitimate; deciding
      // whether it is enough is between them and their appraiser.
      renderWithMantine(
        <CpdTable entries={cpdEntries} period={appraisalPeriod} />,
      );
      expect(screen.queryByText(/of \d+/)).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    });

    it("reads 'point' rather than 'points' for a total of one", () => {
      renderWithMantine(
        <CpdTable
          entries={[{ ...cpdEntries[0], points: 1 }]}
          period={appraisalPeriod}
        />,
      );
      expect(screen.getByText("1 point")).toBeInTheDocument();
    });
  });

  describe("Entries", () => {
    it("sorts by the date the activity happened", () => {
      renderWithMantine(
        <CpdTable entries={cpdEntries} period={appraisalPeriod} />,
      );

      const rows = screen.getAllByText(/\d{1,2} \w{3} 202\d/);
      const first = rows.find((row) => row.textContent?.includes("2025"));
      expect(first).toBeDefined();
    });

    it("renders a dash where no points were claimed", () => {
      renderWithMantine(
        <CpdTable entries={cpdEntries} period={appraisalPeriod} />,
      );
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });
  });

  describe("Empty state", () => {
    it("says nothing was recorded for this period", () => {
      renderWithMantine(<CpdTable entries={[]} period={appraisalPeriod} />);
      expect(
        screen.getByText("Nothing recorded for this period"),
      ).toBeInTheDocument();
    });

    it("still states the period, so an empty year is legible", () => {
      renderWithMantine(<CpdTable entries={[]} period={appraisalPeriod} />);
      expect(screen.getByText(/1 Aug 2025/)).toBeInTheDocument();
    });
  });

  describe("Selection", () => {
    it("passes the chosen activity up", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      renderWithMantine(
        <CpdTable
          entries={cpdEntries}
          period={appraisalPeriod}
          onSelect={onSelect}
        />,
      );

      await user.click(screen.getByText("Regional study day"));

      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });
});
