/**
 * Passport Page Tests
 *
 * The page is a thin composition, so these cover what only the page can
 * get wrong: the fetch, the loading state, and the error path.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportPage } from "./PassportPage";
import { competencies } from "@/components/passport/fixtures";

const fetchMyPassport = vi.fn();
const createPassport = vi.fn();
const fetchInbox = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  createPassport: (...args: unknown[]) => createPassport(...args),
  fetchInbox: (...args: unknown[]) => fetchInbox(...args),
}));

/** The shape `api.ts` throws: an Error carrying the HTTP status. */
function httpError(status: number): Error & { status: number } {
  const err = new Error(`HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

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
    fetchInbox.mockResolvedValue([]);
  });

  describe("The entitlement warning", () => {
    it("warns on the way in when the end is close", async () => {
      // Shown here rather than at the point of refusal: finding out
      // half way through typing a reflection is the worst moment.
      fetchMyPassport.mockResolvedValue({
        ...detail,
        entitlement: { ends_on: "2026-10-05T00:00:00Z", days_remaining: 14 },
      });
      renderWithRouter(<PassportPage />);

      expect(
        await screen.findByText(/becomes read-only in 14 days/),
      ).toBeInTheDocument();
    });

    it("says the record can still be read and downloaded", async () => {
      // The guarantee that matters: a lapse never locks somebody out
      // of their own professional record.
      fetchMyPassport.mockResolvedValue({
        ...detail,
        entitlement: { ends_on: "2026-09-22T00:00:00Z", days_remaining: 0 },
      });
      renderWithRouter(<PassportPage />);

      expect(
        await screen.findByText(/read your record and download it/),
      ).toBeInTheDocument();
    });

    it("stays quiet while the end is far off", async () => {
      fetchMyPassport.mockResolvedValue({
        ...detail,
        entitlement: { ends_on: "2027-09-01T00:00:00Z", days_remaining: 344 },
      });
      renderWithRouter(<PassportPage />);

      await screen.findByText("Perform bronchoscopy");
      expect(screen.queryByText(/read-only/)).not.toBeInTheDocument();
    });

    it("stays quiet when the response carries no entitlement", async () => {
      // An older backend, or a reader who is not the holder.
      fetchMyPassport.mockResolvedValue(detail);
      renderWithRouter(<PassportPage />);

      await screen.findByText("Perform bronchoscopy");
      expect(screen.queryByText(/read-only/)).not.toBeInTheDocument();
    });
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
    // these cards are the only route to every other passport page.
    // Without them those pages are addressable only by typing the URL,
    // which is how they sat for a fortnight.
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    for (const name of [
      "Sign-offs",
      "Logbook",
      "CPD",
      "Certificates",
      "Reflections",
      "Download",
    ]) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
  });

  it("offers a way into each section", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    for (const label of [
      "Open sign-offs",
      "Open logbook",
      "Open CPD",
      "Open certificates",
      "Open reflections",
      "Open download",
    ]) {
      expect(
        await screen.findByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("offers a way into the assessor's queue", async () => {
    // `/passport/inbox` was built and tested and nothing linked to it,
    // so a request to assess somebody sat where only a typed URL
    // reached it — and the person who asked could not tell.
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByRole("button", {
        name: "Sign-off requests for me to assess",
      }),
    ).toBeInTheDocument();
  });

  it("keeps that queue reachable without a passport of your own", async () => {
    // Being asked to assess a colleague does not depend on having
    // started a passport, so the way in survives the empty state.
    fetchMyPassport.mockRejectedValue(httpError(404));
    renderWithRouter(<PassportPage />);

    await screen.findByText("You do not have a passport yet");

    expect(
      screen.getByRole("button", {
        name: "Sign-off requests for me to assess",
      }),
    ).toBeInTheDocument();
  });

  it("shows how many sign-off requests are waiting", async () => {
    // A bare icon says nothing about whether anybody is waiting, so a
    // holder would have to click to find out and would soon stop.
    fetchMyPassport.mockResolvedValue(detail);
    fetchInbox.mockResolvedValue([{}, {}, {}]);
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByRole("button", {
        name: "Sign-off requests for me to assess (3 waiting)",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the passport readable when the count cannot be fetched", async () => {
    // The count is a convenience beside the title. An error banner
    // about somebody else's queue has no business sitting above the
    // holder's own record.
    fetchMyPassport.mockResolvedValue(detail);
    fetchInbox.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportPage />);

    expect(await screen.findByText("Perform bronchoscopy")).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-count")).not.toBeInTheDocument();
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

  it("offers to create one when the holder has no passport yet", async () => {
    // 404 is the ordinary state of everybody who has never pressed the
    // button, not a fault. It was reported as a failed load until
    // somebody opened the page on a fresh account and was told to try
    // again — advice that could never have worked.
    fetchMyPassport.mockRejectedValue(httpError(404));
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText("You do not have a passport yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create my passport" }),
    ).toBeInTheDocument();
  });

  it("does not call a missing passport an error", async () => {
    // The distinction this page got wrong. Guards against a regression
    // that reverts to one catch-all branch.
    fetchMyPassport.mockRejectedValue(httpError(404));
    renderWithRouter(<PassportPage />);

    await screen.findByText("You do not have a passport yet");

    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it("still reports a genuine failure as an error", async () => {
    // The counterpart: a 500 must not be mistaken for an empty
    // passport and silently offer to create a second one.
    fetchMyPassport.mockRejectedValue(httpError(500));
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText(/Your passport could not be loaded/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create my passport" }),
    ).not.toBeInTheDocument();
  });

  it("creates the passport and shows it", async () => {
    const user = userEvent.setup();
    fetchMyPassport.mockRejectedValueOnce(httpError(404));
    createPassport.mockResolvedValue(detail.passport);
    fetchMyPassport.mockResolvedValueOnce(detail);

    renderWithRouter(<PassportPage />);

    await user.click(
      await screen.findByRole("button", { name: "Create my passport" }),
    );

    expect(createPassport).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Perform bronchoscopy")).toBeInTheDocument();
  });

  it("explains a failed creation rather than leaving the button silent", async () => {
    const user = userEvent.setup();
    fetchMyPassport.mockRejectedValue(httpError(404));
    createPassport.mockRejectedValue(new Error("network"));

    renderWithRouter(<PassportPage />);

    await user.click(
      await screen.findByRole("button", { name: "Create my passport" }),
    );

    expect(await screen.findByText(/could not be created/)).toBeInTheDocument();
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
