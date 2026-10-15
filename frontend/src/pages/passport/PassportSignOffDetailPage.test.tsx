/**
 * Passport Sign-off Detail Page Tests
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { requested, signedOff } from "@/components/passport/fixtures";
import { Component as PassportSignOffDetailPage } from "./PassportSignOffDetailPage";
import type * as passportLib from "@lib/passport";

import type { PassportDetail } from "@lib/passport";
const { fetchMyPassport, fetchSignOff, withdrawSignOff } = vi.hoisted(() => ({
  fetchMyPassport: vi.fn<typeof passportLib.fetchMyPassport>(),
  fetchSignOff: vi.fn<typeof passportLib.fetchSignOff>(),
  withdrawSignOff: vi.fn<typeof passportLib.withdrawSignOff>(),
}));
const navigate = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport,
  fetchSignOff,
  withdrawSignOff,
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ name: "2026-03-14-perform-bronchoscopy" }),
  };
});

function detail(canWrite = true): PassportDetail {
  return {
    passport: {
      passport_id: "3f2a8c1e",
      holder_user_id: "42",
      holder_name: "Dr Mark Bailey",
      registrations: [],
      created_at: "2026-09-10",
      head_commit: null,
    },
    competencies: [],
    entitlement: { can_write: canWrite },
  };
}

describe("PassportSignOffDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail());
  });

  it("shows the sign-off in full", async () => {
    fetchSignOff.mockResolvedValue(signedOff);
    renderWithRouter(<PassportSignOffDetailPage />);

    expect(await screen.findByTestId("sign-off-card")).toBeInTheDocument();
    expect(fetchSignOff).toHaveBeenCalledWith(
      "3f2a8c1e",
      "2026-03-14-perform-bronchoscopy",
    );
    expect(screen.getByText(/Dr Amara Okonkwo/)).toBeInTheDocument();
  });

  it("offers nothing to do once the sign-off is decided", async () => {
    fetchSignOff.mockResolvedValue(signedOff);
    renderWithRouter(<PassportSignOffDetailPage />);

    await screen.findByTestId("sign-off-card");
    expect(
      screen.queryByRole("button", { name: /withdraw/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /request a sign-off/i }),
    ).not.toBeInTheDocument();
  });

  it("withdraws an open request after confirming, then returns to the list", async () => {
    const user = userEvent.setup();
    fetchSignOff.mockResolvedValue(requested);
    withdrawSignOff.mockResolvedValue({
      name: requested.name,
      status: "declined",
      commit: "abc",
    });
    renderWithRouter(<PassportSignOffDetailPage />);

    await user.click(
      await screen.findByRole("button", { name: "Withdraw request" }),
    );
    await user.click(await screen.findByRole("button", { name: "Withdraw" }));

    await waitFor(() =>
      expect(withdrawSignOff).toHaveBeenCalledWith(
        "3f2a8c1e",
        "2026-03-14-perform-bronchoscopy",
      ),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/passport/sign-offs"),
    );
  });

  it("disables withdrawing where the passport is read-only", async () => {
    fetchMyPassport.mockResolvedValue(detail(false));
    fetchSignOff.mockResolvedValue(requested);
    renderWithRouter(<PassportSignOffDetailPage />);

    expect(
      await screen.findByRole("button", { name: "Withdraw request" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("says so when the sign-off is not in this passport", async () => {
    fetchSignOff.mockRejectedValue(new Error("Not found"));
    renderWithRouter(<PassportSignOffDetailPage />);

    expect(
      await screen.findByText("That sign-off is not here"),
    ).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportSignOffDetailPage />);

    expect(
      await screen.findByText(/That sign-off could not be loaded/),
    ).toBeInTheDocument();
  });
});
