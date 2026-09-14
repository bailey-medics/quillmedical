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
const fetchLogbook = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchLogbook: (...args: unknown[]) => fetchLogbook(...args),
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
  });

  it("asks the holder to choose a competency first", async () => {
    renderWithRouter(<PassportLogbookPage />);

    expect(await screen.findByText("Choose a competency")).toBeInTheDocument();
  });

  it("fetches nothing until a competency is chosen", async () => {
    renderWithRouter(<PassportLogbookPage />);

    await screen.findByText("Choose a competency");

    expect(fetchLogbook).not.toHaveBeenCalled();
  });

  it("offers the picker", async () => {
    renderWithRouter(<PassportLogbookPage />);

    expect(await screen.findByText("Which competency?")).toBeInTheDocument();
  });

  it("explains a failed passport load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportLogbookPage />);

    expect(
      await screen.findByText(/Your passport could not be loaded/),
    ).toBeInTheDocument();
  });
});
