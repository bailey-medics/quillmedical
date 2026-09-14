/**
 * Passport Competency Page Tests
 *
 * Fetches the assessor list from `/users`, since no passport endpoint
 * serves one. A missing list must not take the page down with it.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportCompetencyPage } from "./PassportCompetencyPage";
import { competencies } from "@/components/passport/fixtures";

const fetchMyPassport = vi.fn();
const requestSignOff = vi.fn();
const apiGet = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  requestSignOff: (...args: unknown[]) => requestSignOff(...args),
}));

vi.mock("@lib/api", () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
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

function renderPage(competencyId = "perform_bronchoscopy") {
  return renderWithRouter(<PassportCompetencyPage />, {
    initialRoute: `/passport/competency/${competencyId}`,
    routePath: "/passport/competency/:id",
  });
}

describe("PassportCompetencyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
    apiGet.mockResolvedValue({ users: [{ id: 42, username: "dr.okonkwo" }] });
  });

  // The name appears twice: once in the page header, once in the
  // summary beneath it. Both are wanted, so the query allows for both.
  it("names the competency from the route", async () => {
    renderPage();

    expect(await screen.findAllByText("Perform bronchoscopy")).not.toHaveLength(
      0,
    );
  });

  it("survives a missing assessor list", async () => {
    // The rest of the page still reads; the request form simply has
    // nobody to offer.
    apiGet.mockRejectedValue(new Error("forbidden"));
    renderPage();

    expect(await screen.findAllByText("Perform bronchoscopy")).not.toHaveLength(
      0,
    );
  });

  it("says nothing is recorded for an unknown competency", async () => {
    renderPage("not_a_competency");

    expect(await screen.findByText("Nothing recorded yet")).toBeInTheDocument();
  });

  it("explains a failed passport load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderPage();

    expect(
      await screen.findByText(/Your passport could not be loaded/),
    ).toBeInTheDocument();
  });
});
