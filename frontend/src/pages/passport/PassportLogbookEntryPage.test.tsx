/**
 * Passport Logbook Entry Page Tests
 *
 * The page reads a competency's logbook and picks one entry out of it,
 * then lets the holder correct it. Worth testing: it finds the right
 * entry, says plainly when there is none, and saves a correction without
 * losing what the form does not show.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportLogbookEntryPage } from "./PassportLogbookEntryPage";

const fetchMyPassport = vi.fn();
const fetchLogbook = vi.fn();
const amendLogbookEntry = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchLogbook: (...args: unknown[]) => fetchLogbook(...args),
  amendLogbookEntry: (...args: unknown[]) => amendLogbookEntry(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useParams: () => ({
      competencyId: "perform_cannulation",
      stem: "20260314T1432",
    }),
  };
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

function entry(filename: string, outcome: string) {
  return {
    filename,
    competency: "perform_cannulation",
    performed_on: "2026-03-14",
    setting: "Emergency department",
    supervision: "supervised" as const,
    supervisor: "Dr Okonkwo",
    indication: null,
    outcome,
    notes: null,
    also_counts_towards: ["assess_sact_toxicity"],
    attachments: [],
  };
}

function logbook(...entries: ReturnType<typeof entry>[]) {
  return {
    competency: "perform_cannulation",
    count: entries.length,
    entries,
  };
}

describe("PassportLogbookEntryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
  });

  it("shows the entry named in the link", async () => {
    fetchLogbook.mockResolvedValue(
      logbook(
        entry("something-else", "Abandoned"),
        entry("20260314T1432", "First pass"),
      ),
    );
    renderWithRouter(<PassportLogbookEntryPage />);

    expect(await screen.findByText("First pass")).toBeInTheDocument();
    expect(screen.getByText("Emergency department")).toBeInTheDocument();
    expect(screen.getByText("Supervised")).toBeInTheDocument();
    expect(screen.queryByText("Abandoned")).not.toBeInTheDocument();
    expect(fetchLogbook).toHaveBeenCalledWith(
      "3f2a8c1e",
      "perform_cannulation",
    );
  });

  it("names the section, then the competency, in the title", async () => {
    fetchLogbook.mockResolvedValue(
      logbook(entry("20260314T1432", "First pass")),
    );
    renderWithRouter(<PassportLogbookEntryPage />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /^Logbook: / }),
    ).toBeInTheDocument();
  });

  it("says plainly when the entry is not there", async () => {
    fetchLogbook.mockResolvedValue(logbook(entry("something-else", "x")));
    renderWithRouter(<PassportLogbookEntryPage />);

    expect(
      await screen.findByText("That entry is not here"),
    ).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchLogbook.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportLogbookEntryPage />);

    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
  });

  it("turns the card into the logbook form, filled in", async () => {
    const user = userEvent.setup();
    fetchLogbook.mockResolvedValue(
      logbook(entry("20260314T1432", "First pass")),
    );
    renderWithRouter(<PassportLogbookEntryPage />);

    await user.click(await screen.findByRole("button", { name: "Edit entry" }));

    expect(screen.getByRole("textbox", { name: /Outcome/ })).toHaveValue(
      "First pass",
    );
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });

  it("saves a correction without losing what the form does not show", async () => {
    // The other competencies the entry counts towards are not on the
    // form. Leaving them out of the save would have cleared them.
    const user = userEvent.setup();
    fetchLogbook.mockResolvedValue(
      logbook(entry("20260314T1432", "First pass")),
    );
    amendLogbookEntry.mockResolvedValue({
      name: "20260314T1432",
      commit: "c1",
    });
    renderWithRouter(<PassportLogbookEntryPage />);

    await user.click(await screen.findByRole("button", { name: "Edit entry" }));
    const outcome = screen.getByRole("textbox", { name: /Outcome/ });
    await user.clear(outcome);
    await user.type(outcome, "Second pass");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(amendLogbookEntry).toHaveBeenCalled());
    expect(amendLogbookEntry).toHaveBeenCalledWith(
      "3f2a8c1e",
      "perform_cannulation",
      "20260314T1432",
      expect.objectContaining({
        outcome: "Second pass",
        also_counts_towards: ["assess_sact_toxicity"],
      }),
    );
  });

  it("offers no edit where the holder may no longer write", async () => {
    fetchMyPassport.mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    fetchLogbook.mockResolvedValue(
      logbook(entry("20260314T1432", "First pass")),
    );
    renderWithRouter(<PassportLogbookEntryPage />);

    expect(
      await screen.findByRole("button", { name: "Edit entry" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
