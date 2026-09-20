/**
 * Passport Logbook Page Tests
 *
 * The competency is chosen on the page rather than taken from the route,
 * so the page has a state the others do not: nothing chosen yet.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
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

  it("offers no way to add an entry before a competency is chosen", async () => {
    // An entry counts towards a competency, so there is nothing to
    // record until the page knows which one.
    renderWithRouter(<PassportLogbookPage />);

    await screen.findByText("Which competency?");

    expect(
      screen.queryByRole("button", { name: "Add an entry" }),
    ).not.toBeInTheDocument();
  });

  it("offers the picker", async () => {
    renderWithRouter(<PassportLogbookPage />);

    expect(await screen.findByText("Which competency?")).toBeInTheDocument();
  });

  it("explains a failed passport load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportLogbookPage />);

    expect(
      await screen.findByText(/Your logbook could not be loaded/),
    ).toBeInTheDocument();
  });
});
