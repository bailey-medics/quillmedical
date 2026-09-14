/**
 * Passport Verify Page Tests
 *
 * What the QR code on a printed passport opens. A reader arriving from
 * paper has no session, so the page must cope with a link that is
 * missing what it needs rather than failing silently.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportVerifyPage } from "./PassportVerifyPage";
import { unchangedVerification } from "@/components/passport/fixtures";

const verifySignOff = vi.fn();

vi.mock("@lib/passport", () => ({
  verifySignOff: (...args: unknown[]) => verifySignOff(...args),
}));

describe("PassportVerifyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the result when the link carries both ids", async () => {
    verifySignOff.mockResolvedValue(unchangedVerification);

    renderWithRouter(<PassportVerifyPage />, {
      initialRoute: "/passport/verify/abc?passport=3f2a8c1e",
      routePath: "/passport/verify/:signOffId",
    });

    expect(
      await screen.findByText("This record is unchanged"),
    ).toBeInTheDocument();
  });

  it("says the link is incomplete when the passport id is missing", () => {
    // The QR code encodes both. A link with one is a broken link, and
    // saying so beats an empty page.
    renderWithRouter(<PassportVerifyPage />, {
      initialRoute: "/passport/verify/abc",
      routePath: "/passport/verify/:signOffId",
    });

    expect(
      screen.getByText(/This link is missing the record it should check/),
    ).toBeInTheDocument();
  });

  it("does not call the API when the link is incomplete", () => {
    renderWithRouter(<PassportVerifyPage />, {
      initialRoute: "/passport/verify/abc",
      routePath: "/passport/verify/:signOffId",
    });

    expect(verifySignOff).not.toHaveBeenCalled();
  });

  it("explains a refused check rather than implying the record is bad", async () => {
    // A 403 means the reader may not see it, not that the record failed
    // verification — a distinction that matters on a printed passport.
    verifySignOff.mockRejectedValue(new Error("forbidden"));

    renderWithRouter(<PassportVerifyPage />, {
      initialRoute: "/passport/verify/abc?passport=3f2a8c1e",
      routePath: "/passport/verify/:signOffId",
    });

    expect(
      await screen.findByText(/You may not have permission to read it/),
    ).toBeInTheDocument();
  });
});
