/**
 * Passport CPD Page Tests
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportCpdPage } from "./PassportCpdPage";
import { cpdEntries } from "@/components/passport/fixtures";

const fetchMyPassport = vi.fn();
const fetchCpdYear = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchCpdYear: (...args: unknown[]) => fetchCpdYear(...args),
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

describe("PassportCpdPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
  });

  it("renders the year's activities", async () => {
    fetchCpdYear.mockResolvedValue(cpdEntries);
    renderWithRouter(<PassportCpdPage />);

    expect(await screen.findByText("Regional study day")).toBeInTheDocument();
  });

  it("asks the API for the passport before asking for a year", async () => {
    // The CPD endpoint is addressed by passport id, so the order matters.
    fetchCpdYear.mockResolvedValue([]);
    renderWithRouter(<PassportCpdPage />);

    await screen.findByText(/Nothing recorded for this period/);

    expect(fetchCpdYear).toHaveBeenCalledWith("3f2a8c1e", expect.any(Number));
  });

  it("explains a failed year load", async () => {
    fetchCpdYear.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportCpdPage />);

    expect(
      await screen.findByText(/That year could not be loaded/),
    ).toBeInTheDocument();
  });

  it("explains a failed passport load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportCpdPage />);

    expect(
      await screen.findByText(/Your passport could not be loaded/),
    ).toBeInTheDocument();
  });
});
