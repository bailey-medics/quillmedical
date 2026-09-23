/**
 * Passport Logbook Page Tests
 *
 * Two controls that were once one: a filter for narrowing the view, and
 * a picker for saying what a new entry counts towards. They were split
 * because narrowing is reading and choosing is writing, so a read-only
 * holder must keep the first and lose the second.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportLogbookPage } from "./PassportLogbookPage";

const fetchMyPassport = vi.fn();
const fetchWholeLogbook = vi.fn();
const addLogbookEntry = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchWholeLogbook: (...args: unknown[]) => fetchWholeLogbook(...args),
  addLogbookEntry: (...args: unknown[]) => addLogbookEntry(...args),
}));

const detail = {
  passport: {
    passport_id: "3f2a8c1e",
    holder_user_id: "42",
    holder_name: "Dr Mark Bailey",
    registrations: [],
    created_at: "2026-09-10",
    head_commit: null,
  },
  competencies: [],
};

describe("PassportLogbookPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
    fetchWholeLogbook.mockResolvedValue({ competencies: [], count: 0 });
  });

  it("shows every competency's entries without being asked", async () => {
    // A holder opening their logbook wants to see what is in it. It
    // used to show nothing at all until a competency was picked, so
    // the page was blank for anybody who did not already know what
    // they were looking for.
    fetchWholeLogbook.mockResolvedValue({
      count: 2,
      competencies: [
        {
          competency: "perform_venepuncture",
          count: 1,
          entries: [
            {
              filename: "a",
              competency: "perform_venepuncture",
              performed_on: "2026-03-01",
            },
          ],
        },
        {
          competency: "certify_death",
          count: 1,
          entries: [
            {
              filename: "b",
              competency: "certify_death",
              performed_on: "2026-03-02",
            },
          ],
        },
      ],
    });
    renderWithRouter(<PassportLogbookPage />);

    expect(await screen.findByText(/venepuncture/i)).toBeInTheDocument();
    expect(screen.getByText(/certify death/i)).toBeInTheDocument();
  });

  it("says so when nothing has been logged", async () => {
    renderWithRouter(<PassportLogbookPage />);

    expect(await screen.findByText("Nothing logged yet")).toBeInTheDocument();
  });

  it("keeps the picker out of the way until an entry is being added", async () => {
    // It answers one question, asked at one moment. On the page it read
    // as a second filter beside the real one.
    renderWithRouter(<PassportLogbookPage />);

    await screen.findByRole("button", { name: "Add an entry" });

    expect(screen.queryByText("Which competency?")).not.toBeInTheDocument();
  });

  it("asks which competency once an entry is being added", async () => {
    renderWithRouter(<PassportLogbookPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add an entry" }),
    );

    expect(await screen.findByText("Which competency?")).toBeInTheDocument();
  });

  it("disables adding where the passport is read-only", async () => {
    // Adding goes through `_require_writer`, so the button would answer
    // 403. The filter below is untouched: narrowing the view is
    // reading, which a read-only holder keeps.
    fetchMyPassport.mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    renderWithRouter(<PassportLogbookPage />);

    expect(
      await screen.findByRole("button", { name: "Add an entry" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("leaves the filter usable where the passport is read-only", async () => {
    // The point of splitting the two controls. A holder whose
    // entitlement has ended keeps every read, and narrowing a long
    // logbook is reading.
    fetchMyPassport.mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    fetchWholeLogbook.mockResolvedValue({
      count: 2,
      competencies: [
        {
          competency: "perform_venepuncture",
          count: 1,
          entries: [
            {
              filename: "a",
              competency: "perform_venepuncture",
              performed_on: "2026-03-01",
            },
          ],
        },
        {
          competency: "certify_death",
          count: 1,
          entries: [
            {
              filename: "b",
              competency: "certify_death",
              performed_on: "2026-03-02",
            },
          ],
        },
      ],
    });
    renderWithRouter(<PassportLogbookPage />);

    // Both entries are shown, and the filter is there to narrow them.
    // `FilterSelect` takes no `disabled` prop, so the thing worth
    // asserting is that the page still offers it and still renders
    // what it would narrow.
    expect(await screen.findByText("Perform Venepuncture")).toBeInTheDocument();
    expect(screen.getByText("Certify Death")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Filter the logbook by competency",
      }),
    ).toBeInTheDocument();
  });

  it("explains a failed passport load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportLogbookPage />);

    expect(
      await screen.findByText(/Your logbook could not be loaded/),
    ).toBeInTheDocument();
  });
});
