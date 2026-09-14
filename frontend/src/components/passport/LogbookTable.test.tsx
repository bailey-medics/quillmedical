/**
 * LogbookTable Component Tests
 *
 * The "counts, never comparisons" rule is the point of this component,
 * so most of these guard it.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import LogbookTable from "./LogbookTable";
import { logbook, emptyLogbook, singleEntryLogbook } from "./fixtures";

describe("LogbookTable", () => {
  describe("Counts, never comparisons", () => {
    it("reports the count the server gave", () => {
      renderWithMantine(<LogbookTable logbook={logbook} />);
      expect(screen.getByText("38 entries")).toBeInTheDocument();
    });

    it("reads 'entry' rather than 'entries' for a count of one", () => {
      renderWithMantine(<LogbookTable logbook={singleEntryLogbook} />);
      expect(screen.getByText("1 entry")).toBeInTheDocument();
    });

    it("shows no target, denominator or percentage", () => {
      // How many is enough belongs to the assessor. A table that
      // appeared to have decided would invite them to defer to it.
      renderWithMantine(<LogbookTable logbook={logbook} />);
      expect(screen.queryByText(/of \d+/)).not.toBeInTheDocument();
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("never says whether the holder is ready or complete", () => {
      renderWithMantine(<LogbookTable logbook={logbook} />);
      expect(screen.queryByText(/complete/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
    });
  });

  describe("Ordering", () => {
    it("sorts by when the procedure happened, not when it was logged", () => {
      // The fixture's entries are deliberately out of clinical order.
      renderWithMantine(<LogbookTable logbook={logbook} />);

      const cells = screen.getAllByText(/\d{1,2} \w+ 2026/);
      const rendered = cells.map((cell) => cell.textContent);

      // FormattedDate's "medium" format renders "10 Mar 2026".
      expect(rendered[0]).toContain("10 Mar");
      expect(rendered[rendered.length - 1]).toContain("21 Mar");
    });
  });

  describe("Supervision", () => {
    it("shows both states without ranking them", () => {
      renderWithMantine(<LogbookTable logbook={logbook} />);
      expect(screen.getByText("Supervised")).toBeInTheDocument();
      expect(screen.getByText("Independent")).toBeInTheDocument();
    });

    it("renders a dash where nothing was recorded", () => {
      renderWithMantine(<LogbookTable logbook={logbook} />);
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });
  });

  describe("Empty state", () => {
    it("says there are no entries yet", () => {
      renderWithMantine(<LogbookTable logbook={emptyLogbook} />);
      expect(screen.getByText("No entries yet")).toBeInTheDocument();
    });

    it("still reports a count of zero rather than hiding it", () => {
      renderWithMantine(<LogbookTable logbook={emptyLogbook} />);
      expect(screen.getByText("0 entries")).toBeInTheDocument();
    });
  });

  describe("Heading", () => {
    it("prefers the human competency name when the page knows it", () => {
      renderWithMantine(
        <LogbookTable
          logbook={logbook}
          competencyName="Perform bronchoscopy"
        />,
      );
      expect(screen.getByText("Perform bronchoscopy")).toBeInTheDocument();
    });

    it("falls back to the competency id", () => {
      renderWithMantine(<LogbookTable logbook={logbook} />);
      expect(screen.getByText("perform_bronchoscopy")).toBeInTheDocument();
    });
  });

  describe("Selection", () => {
    it("passes the chosen entry up", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      renderWithMantine(<LogbookTable logbook={logbook} onSelect={onSelect} />);

      await user.click(screen.getByText("Bristol Royal Infirmary"));

      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });
});
