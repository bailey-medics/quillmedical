/**
 * Passport Reflections Page Tests
 *
 * Holder-only, and the page says so. A doctor deciding how frankly to
 * write deserves to be told who can read it.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportReflectionsPage } from "./PassportReflectionsPage";

const fetchMyPassport = vi.fn();
const fetchReflections = vi.fn();
const addReflection = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchReflections: (...args: unknown[]) => fetchReflections(...args),
  addReflection: (...args: unknown[]) => addReflection(...args),
}));

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

const reflection = {
  name: "2026-03-14-difficult-airway",
  title: "Difficult airway",
  written_on: "2026-03-14",
  body: "What I took from it.",
  competencies: [],
  attachments: [],
};

describe("PassportReflectionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
  });

  it("lists the holder's reflections", async () => {
    fetchReflections.mockResolvedValue([reflection]);
    renderWithRouter(<PassportReflectionsPage />);

    expect(await screen.findByText("Difficult airway")).toBeInTheDocument();
  });

  it("says reflections are private when there are none", async () => {
    fetchReflections.mockResolvedValue([]);
    renderWithRouter(<PassportReflectionsPage />);

    expect(
      await screen.findByText(/no assessor or administrator can read them/),
    ).toBeInTheDocument();
  });

  it("opens the editor on request", async () => {
    const user = userEvent.setup();
    fetchReflections.mockResolvedValue([]);
    renderWithRouter(<PassportReflectionsPage />);

    await user.click(
      await screen.findByRole("button", { name: /Write a reflection/ }),
    );

    expect(screen.getByText("Only you can read this")).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchReflections.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportReflectionsPage />);

    expect(
      await screen.findByText(/Your reflections could not be loaded/),
    ).toBeInTheDocument();
  });
});
