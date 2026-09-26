/**
 * Passport CPD Entry Page Tests
 *
 * The page reads a year and picks one activity out of it, so what is
 * worth testing is that it finds the right one, says so plainly when
 * there is none, and tells that apart from a failed load.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportCpdEntryPage } from "./PassportCpdEntryPage";

const fetchMyPassport = vi.fn();
const fetchCpdYear = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchCpdYear: (...args: unknown[]) => fetchCpdYear(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useParams: () => ({ year: "2026", stem: "als-course" }) };
});

const detail = {
  passport: {
    passport_id: "3f2a8c1e",
    holder_user_id: "42",
    holder_name: "Dr Mark Bailey",
    registrations: [],
    specialties: [],
    created_at: "2026-09-10",
    head_commit: null,
  },
  competencies: [],
};

function entry(filename: string, title: string) {
  return {
    filename,
    year: 2026,
    activity_on: "2026-03-14",
    title,
    activity_type: "course",
    points: 6,
    competencies: [],
    certificate: null,
    notes: "What I took from it.",
    attachments: [],
  };
}

describe("PassportCpdEntryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
  });

  it("shows the activity named in the link", async () => {
    fetchCpdYear.mockResolvedValue([
      entry("something-else", "Journal club"),
      entry("als-course", "Advanced life support"),
    ]);
    renderWithRouter(<PassportCpdEntryPage />);

    expect(await screen.findByText("What I took from it.")).toBeInTheDocument();
    expect(screen.queryByText("Journal club")).not.toBeInTheDocument();
  });

  it("says plainly when the activity is not there", async () => {
    // A link to something removed, or a mistyped one. Distinct from a
    // failed load: only one of the two is worth retrying.
    fetchCpdYear.mockResolvedValue([entry("something-else", "Journal club")]);
    renderWithRouter(<PassportCpdEntryPage />);

    expect(
      await screen.findByText("That activity is not here"),
    ).toBeInTheDocument();
  });

  it("explains a failed load rather than calling it missing", async () => {
    fetchCpdYear.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportCpdEntryPage />);

    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(
      screen.queryByText("That activity is not here"),
    ).not.toBeInTheDocument();
  });
});
