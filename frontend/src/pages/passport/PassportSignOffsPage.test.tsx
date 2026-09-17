/**
 * Passport Sign-offs Page Tests
 *
 * The page groups what the passport already knows, so what is worth
 * testing is the grouping: that a competency lands under the right
 * heading, that empty groups stay out of the way, and that a passport
 * with nothing in it explains itself rather than showing three blanks.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportSignOffsPage } from "./PassportSignOffsPage";
import type { CompetencyState, SignOffStatus } from "@lib/passport";

const fetchMyPassport = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
}));

function competency(
  id: string,
  name: string,
  status: SignOffStatus,
): CompetencyState {
  return {
    id,
    name,
    status,
    level: null,
    signed_on: null,
    signed_off_by: null,
    expires_on: null,
    sign_off: null,
    previous_sign_offs: [],
    logbook_entries: 0,
    certificates: [],
  };
}

function detailWith(competencies: CompetencyState[]) {
  return {
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
}

describe("PassportSignOffsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("puts each competency under the heading for its status", async () => {
    fetchMyPassport.mockResolvedValue(
      detailWith([
        competency("a", "Perform bronchoscopy", "signed_off"),
        competency("b", "Insert a chest drain", "requested"),
        competency("c", "Prescribe chemotherapy", "declined"),
      ]),
    );
    renderWithRouter(<PassportSignOffsPage />);

    // Wait on a competency name, not a heading. Every heading is drawn
    // during the loading render too, so waiting on one can return while
    // the page is still skeletons. A name only ever appears once the
    // passport has arrived.
    expect(await screen.findByText("Perform bronchoscopy")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Awaiting sign-off" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Signed off" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Declined" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Insert a chest drain")).toBeInTheDocument();
  });

  it("leaves out a group with nothing in it", async () => {
    // Three headings above three empty cards would say nothing while
    // taking up the whole page.
    fetchMyPassport.mockResolvedValue(
      detailWith([competency("a", "Perform bronchoscopy", "signed_off")]),
    );
    renderWithRouter(<PassportSignOffsPage />);

    // The loading render draws all three headings, so waiting on
    // "Signed off" can return before the passport has arrived and leave
    // the other two still on the page. A competency name only shows once
    // it has.
    await screen.findByText("Perform bronchoscopy");

    expect(
      screen.queryByRole("heading", { name: "Declined" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Awaiting sign-off" }),
    ).not.toBeInTheDocument();
  });

  it("hides a superseded sign-off", async () => {
    // It has been replaced by a newer one, so listing it would show the
    // same competency twice and invite reading the stale half.
    fetchMyPassport.mockResolvedValue(
      detailWith([competency("a", "Perform bronchoscopy", "superseded")]),
    );
    renderWithRouter(<PassportSignOffsPage />);

    await screen.findByText(/Nothing recorded yet/);

    expect(screen.queryByText("Perform bronchoscopy")).not.toBeInTheDocument();
  });

  it("says how a sign-off comes about when there is nothing yet", async () => {
    fetchMyPassport.mockResolvedValue(detailWith([]));
    renderWithRouter(<PassportSignOffsPage />);

    expect(await screen.findByText(/Nothing recorded yet/)).toBeInTheDocument();
    expect(screen.getByText(/asked an assessor/)).toBeInTheDocument();
  });

  it("explains a failed load rather than showing an empty record", async () => {
    // An empty passport and an unreachable one look identical without
    // this, and they mean very different things to a holder.
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportSignOffsPage />);

    expect(
      await screen.findByText(/Your sign-offs could not be loaded/),
    ).toBeInTheDocument();
  });
});
