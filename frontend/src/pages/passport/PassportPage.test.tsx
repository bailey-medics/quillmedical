/**
 * Passport Page Tests
 *
 * The page is a thin composition, so these cover what only the page can
 * get wrong: the fetch, the loading state, and the error path.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportPage } from "./PassportPage";
import { competencies } from "@/components/passport/fixtures";

const fetchMyPassport = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
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
  competencies,
};

describe("PassportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the holder's competencies once loaded", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    expect(await screen.findByText("Perform bronchoscopy")).toBeInTheDocument();
  });

  it("shows the page heading before the fetch resolves", () => {
    fetchMyPassport.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportPage />);

    expect(screen.getByText("My passport")).toBeInTheDocument();
  });

  it("explains a failed load rather than rendering an empty passport", async () => {
    // An empty passport and an unreachable one look identical without
    // this, and they mean very different things to a holder.
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText(/Your passport could not be loaded/),
    ).toBeInTheDocument();
  });

  it("leads to the rest of the passport", async () => {
    // The side navigation has one Passport entry and it points here, so
    // these cards are the only route to the logbook, CPD, certificates
    // and reflections. Without them those pages are addressable only by
    // typing the URL, which is how they sat for a fortnight.
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    for (const name of ["Logbook", "CPD", "Certificates", "Reflections"]) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
  });

  it("offers a way into each section", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    for (const label of [
      "Open logbook",
      "Open CPD",
      "Open certificates",
      "Open reflections",
    ]) {
      expect(
        await screen.findByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("says reflections are private on the card itself", async () => {
    // Before a holder clicks into them, not after. Somebody deciding how
    // frankly to write deserves to know who can read it beforehand.
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText(/no assessor or administrator can read them/),
    ).toBeInTheDocument();
  });

  it("does not render the competency list when the load failed", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Your passport could not be loaded/),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Perform bronchoscopy")).not.toBeInTheDocument();
  });
});
