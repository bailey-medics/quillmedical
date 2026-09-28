/**
 * Passport CPD Entry Page Tests
 *
 * The page reads a year and picks one activity out of it, so what is
 * worth testing is that it finds the right one, says so plainly when
 * there is none, and tells that apart from a failed load.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportCpdEntryPage } from "./PassportCpdEntryPage";

const fetchMyPassport = vi.fn();
const fetchCpdYear = vi.fn();
const amendCpdEntry = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchCpdYear: (...args: unknown[]) => fetchCpdYear(...args),
  amendCpdEntry: (...args: unknown[]) => amendCpdEntry(...args),
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

  it("names the section, then the activity, in the title", async () => {
    fetchCpdYear.mockResolvedValue([
      entry("als-course", "Advanced life support"),
    ]);
    renderWithRouter(<PassportCpdEntryPage />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "CPD: Advanced life support",
      }),
    ).toBeInTheDocument();
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

  describe("Editing", () => {
    const stored = {
      ...entry("als-course", "Advanced life support"),
      competencies: [{ id: "perform_cannulation", name: "Cannulation" }],
      certificate: "als-2026",
    };

    it("turns the card into the CPD form, filled in", async () => {
      const user = userEvent.setup();
      fetchCpdYear.mockResolvedValue([stored]);
      renderWithRouter(<PassportCpdEntryPage />);

      await user.click(
        await screen.findByRole("button", { name: "Edit activity" }),
      );

      expect(screen.getByText("Edit this CPD activity")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /What was it/ })).toHaveValue(
        "Advanced life support",
      );
    });

    it("saves the change without losing what the form does not show", async () => {
      // The competencies and certificate are not on the form. Leaving
      // them out of the save would have cleared them.
      const user = userEvent.setup();
      fetchCpdYear.mockResolvedValue([stored]);
      amendCpdEntry.mockResolvedValue({ name: "als-course", commit: "c1" });
      renderWithRouter(<PassportCpdEntryPage />);

      await user.click(
        await screen.findByRole("button", { name: "Edit activity" }),
      );
      const title = screen.getByRole("textbox", { name: /What was it/ });
      await user.clear(title);
      await user.type(title, "ALS refresher");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(amendCpdEntry).toHaveBeenCalled());
      expect(amendCpdEntry).toHaveBeenCalledWith(
        "3f2a8c1e",
        2026,
        "als-course",
        expect.objectContaining({
          title: "ALS refresher",
          competencies: ["perform_cannulation"],
          certificate: "als-2026",
        }),
      );
    });

    it("offers no edit where the holder may no longer write", async () => {
      fetchMyPassport.mockResolvedValue({
        ...detail,
        entitlement: { can_write: false },
      });
      fetchCpdYear.mockResolvedValue([stored]);
      renderWithRouter(<PassportCpdEntryPage />);

      const button = await screen.findByRole("button", {
        name: "Edit activity",
      });
      // IconTextButton disables through aria-disabled, so it stays
      // focusable and a screen reader can still say why it is off.
      expect(button).toHaveAttribute("aria-disabled", "true");
    });
  });
});
