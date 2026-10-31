/**
 * Passport Competency Page Tests
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import {
  oncologyFrameworks,
  prescribePalliativeCompetency,
  prescribePalliativeLogbook,
  prescribePalliativeSignOffs,
  signedOff,
} from "@/components/passport/fixtures";
import { Component as PassportCompetencyPage } from "./PassportCompetencyPage";
import type * as passportLib from "@lib/passport";
import type { PassportDetail } from "@lib/passport";

const {
  fetchMyPassport,
  fetchSignOffs,
  fetchLogbook,
  requestSignOff,
  addLogbookEntry,
  searchAssessors,
} = vi.hoisted(() => ({
  fetchMyPassport: vi.fn<typeof passportLib.fetchMyPassport>(),
  fetchSignOffs: vi.fn<typeof passportLib.fetchSignOffs>(),
  fetchLogbook: vi.fn<typeof passportLib.fetchLogbook>(),
  requestSignOff: vi.fn<typeof passportLib.requestSignOff>(),
  addLogbookEntry: vi.fn<typeof passportLib.addLogbookEntry>(),
  searchAssessors: vi.fn<typeof passportLib.searchAssessors>(),
}));
const navigate = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport,
  fetchSignOffs,
  fetchLogbook,
  requestSignOff,
  addLogbookEntry,
  searchAssessors,
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { email: "holder@nhs.net", username: "holder" },
    },
  }),
}));

const PASSPORT_ID = "3f2a8c1e";

function detail(canWrite = true): PassportDetail {
  return {
    passport: {
      passport_id: PASSPORT_ID,
      holder_user_id: "42",
      holder_name: "Dr Mark Bailey",
      registrations: [],
      frameworks: [oncologyFrameworks[0]],
      created_at: "2026-09-10",
      head_commit: null,
    },
    competencies: [prescribePalliativeCompetency],
    entitlement: { can_write: canWrite },
  };
}

function renderPage(competencyId = prescribePalliativeCompetency.id) {
  return renderWithRouter(<PassportCompetencyPage />, {
    routePath: "/passport/competencies/:competencyId",
    initialRoute: `/passport/competencies/${competencyId}`,
  });
}

describe("PassportCompetencyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail());
    // A sign-off for another competency too, which must not be listed.
    fetchSignOffs.mockResolvedValue([
      ...prescribePalliativeSignOffs,
      signedOff,
    ]);
    fetchLogbook.mockResolvedValue(prescribePalliativeLogbook);
  });

  it("shows the competency, its framework, its sign-offs and its logbook", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: prescribePalliativeCompetency.name,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(oncologyFrameworks[0].name)).toBeInTheDocument();
    expect(screen.getByText("3 entries")).toBeInTheDocument();
    expect(fetchLogbook).toHaveBeenCalledWith(
      PASSPORT_ID,
      prescribePalliativeCompetency.id,
    );
  });

  it("lists only this competency's sign-offs", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "Sign-offs" });
    expect(screen.queryByText(/Perform bronchoscopy/)).not.toBeInTheDocument();
  });

  it("says a competency outside the catalogue is not found", async () => {
    renderPage("not_a_competency");

    expect(
      await screen.findByText("This competency could not be found."),
    ).toBeInTheDocument();
    expect(fetchMyPassport).not.toHaveBeenCalled();
  });

  it("says so when the passport cannot be loaded", async () => {
    fetchMyPassport.mockRejectedValue(new Error("down"));
    renderPage();

    expect(
      await screen.findByText(
        "This competency could not be loaded. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("offers no add buttons on a read-only passport", async () => {
    fetchMyPassport.mockResolvedValue(detail(false));
    renderPage();

    await screen.findByRole("heading", { name: "Sign-offs" });
    expect(
      screen.queryByRole("button", { name: "Ask for a sign-off" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add an entry" }),
    ).not.toBeInTheDocument();
  });

  it("opens the sign-off request with this competency chosen, and cancels back", async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Ask for a sign-off" }),
    );

    expect(
      await screen.findByRole("button", { name: "Request sign-off" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Sign-offs" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByRole("heading", { name: "Sign-offs" }),
    ).toBeInTheDocument();
  });

  it("opens the logbook entry form with this competency chosen", async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add an entry" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Logbook" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("opens a sign-off on its own page", async () => {
    renderPage();

    await userEvent.click(await screen.findByText(/Requested/));

    expect(navigate).toHaveBeenCalledWith(
      `/passport/sign-offs/${prescribePalliativeSignOffs[0].name}`,
    );
  });
});
