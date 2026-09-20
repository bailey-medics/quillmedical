/**
 * Passport Sign-Off Page Tests
 *
 * The page resolves its record from the inbox, which is the only list an
 * assessor may read. The inbox names the passport each request belongs
 * to, so the page can submit without the passport id ever appearing in
 * the URL.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportSignOffPage } from "./PassportSignOffPage";
import { inboxItem } from "@/components/passport/fixtures";

const fetchInbox = vi.fn();
const signOff = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchInbox: (...args: unknown[]) => fetchInbox(...args),
  signOff: (...args: unknown[]) => signOff(...args),
}));

function renderPage(signOffId = inboxItem.sign_off.id) {
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
    fetchInbox.mockResolvedValue([inboxItem]);
    renderPage();

    expect(
      await screen.findAllByText("Perform thoracic ultrasound"),
    ).not.toHaveLength(0);
  });

  it("offers the sign-off form for a record in the inbox", async () => {
    fetchInbox.mockResolvedValue([inboxItem]);
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Sign off competency" }),
    ).toBeInTheDocument();
  });

  it("signs off against the passport the inbox named", async () => {
    // The passport id comes from the inbox item and nowhere else: it is
    // not in the route, and an assessor cannot read a passport to find
    // it. Submitting against the wrong one would write a sign-off into
    // somebody else's record.
    const user = userEvent.setup();
    fetchInbox.mockResolvedValue([inboxItem]);
    signOff.mockResolvedValue({ name: inboxItem.sign_off.name });
    renderPage();

    // The form will not submit without a basis: SelectField renders as a
    // combobox, never a textbox.
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByText("Directly observed"));
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Sign off competency" }),
    );

    await waitFor(() => {
      expect(signOff).toHaveBeenCalledWith(
        inboxItem.passport_id,
        inboxItem.sign_off.id,
        expect.any(Object),
      );
    });
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
