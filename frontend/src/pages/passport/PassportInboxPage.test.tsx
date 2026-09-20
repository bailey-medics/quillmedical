/**
 * Passport Inbox Page Tests
 *
 * The one passport page an external assessor reaches, so the empty state
 * matters as much as the populated one: a consultant with nothing
 * waiting should be told so, not shown a blank screen.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportInboxPage } from "./PassportInboxPage";
import { inboxItem } from "@/components/passport/fixtures";

const fetchInbox = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchInbox: (...args: unknown[]) => fetchInbox(...args),
}));

describe("PassportInboxPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the requests naming this assessor", async () => {
    fetchInbox.mockResolvedValue([inboxItem]);
    renderWithRouter(<PassportInboxPage />);

    expect(
      await screen.findByText("Perform thoracic ultrasound"),
    ).toBeInTheDocument();
  });

  it("says nothing is waiting rather than showing a blank page", async () => {
    fetchInbox.mockResolvedValue([]);
    renderWithRouter(<PassportInboxPage />);

    expect(await screen.findByText("Nothing waiting")).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchInbox.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportInboxPage />);

    expect(
      await screen.findByText(/Your inbox could not be loaded/),
    ).toBeInTheDocument();
  });

  it("shows no empty state while the fetch is still running", async () => {
    // "Nothing waiting" appearing before the answer arrives would tell a
    // consultant something untrue.
    fetchInbox.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportInboxPage />);

    await waitFor(() => {
      expect(screen.getByText("Sign-off requests")).toBeInTheDocument();
    });

    expect(screen.queryByText("Nothing waiting")).not.toBeInTheDocument();
  });
});
