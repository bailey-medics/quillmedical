/**
 * Passport Sign-Off Page Tests
 *
 * The page resolves its record from the inbox, which is the only list an
 * assessor may read. It cannot yet resolve the passport id, so these
 * pin that limitation rather than pretending it is absent.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportSignOffPage } from "./PassportSignOffPage";
import { requested } from "@/components/passport/fixtures";

const fetchInbox = vi.fn();
const signOff = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchInbox: (...args: unknown[]) => fetchInbox(...args),
  signOff: (...args: unknown[]) => signOff(...args),
}));

function renderPage(signOffId = requested.id) {
  return renderWithRouter(<PassportSignOffPage />, {
    initialRoute: `/passport/sign-off/${signOffId}`,
    routePath: "/passport/sign-off/:signOffId",
  });
}

describe("PassportSignOffPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the record it finds in the inbox", async () => {
    fetchInbox.mockResolvedValue([requested]);
    renderPage();

    expect(
      await screen.findAllByText("Perform thoracic ultrasound"),
    ).not.toHaveLength(0);
  });

  it("offers the sign-off form for a record in the inbox", async () => {
    fetchInbox.mockResolvedValue([requested]);
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Sign off competency" }),
    ).toBeInTheDocument();
  });

  it("refuses a request that is not in this assessor's inbox", async () => {
    // What an assessor may act on comes from the request rows naming
    // them, so a record absent from the inbox is one they may not sign.
    fetchInbox.mockResolvedValue([]);
    renderPage("some-other-id");

    expect(await screen.findByText(/not in your inbox/)).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchInbox.mockRejectedValue(new Error("network"));
    renderPage();

    expect(
      await screen.findByText(/That request could not be loaded/),
    ).toBeInTheDocument();
  });
});
