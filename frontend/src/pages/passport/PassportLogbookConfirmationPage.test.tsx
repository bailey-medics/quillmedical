/**
 * Passport Logbook Confirmation Page Tests
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportLogbookConfirmationPage } from "./PassportLogbookConfirmationPage";
import { logbookConfirmation } from "@/components/passport/fixtures";
import { onInboxChanged } from "@/lib/inbox/inbox";

const fetchLogbookConfirmation = vi.fn();
const answerLogbookConfirmation = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@lib/passport", () => ({
  fetchLogbookConfirmation: (...args: unknown[]) =>
    fetchLogbookConfirmation(...args),
  answerLogbookConfirmation: (...args: unknown[]) =>
    answerLogbookConfirmation(...args),
}));

function renderPage(requestId = "7") {
  return renderWithRouter(<PassportLogbookConfirmationPage />, {
    initialRoute: `/passport/logbook-confirmation/${requestId}`,
    routePath: "/passport/logbook-confirmation/:requestId",
  });
}

describe("PassportLogbookConfirmationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLogbookConfirmation.mockResolvedValue(logbookConfirmation);
    answerLogbookConfirmation.mockResolvedValue({ status: "confirmed" });
  });

  it("shows the entry the supervisor was asked about", async () => {
    renderPage();

    expect(
      await screen.findByText(/Dr Priya Shah has asked you/),
    ).toBeInTheDocument();
    expect(fetchLogbookConfirmation).toHaveBeenCalledWith(7);
  });

  it("confirms the entry, tells the envelope and goes back to the inbox", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    const stop = onInboxChanged(changed);
    renderPage();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Confirm entry" }));

    await waitFor(() =>
      expect(answerLogbookConfirmation).toHaveBeenCalledWith(7, true),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/inbox"));
    expect(changed).toHaveBeenCalled();
    stop();
  });

  it("says it is not theirs to confirm", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Not mine to confirm" }),
    );

    await waitFor(() =>
      expect(answerLogbookConfirmation).toHaveBeenCalledWith(7, false),
    );
  });

  it("says there is nothing to confirm where the ask is gone", async () => {
    fetchLogbookConfirmation.mockRejectedValue(new Error("Nothing to confirm"));
    renderPage();

    expect(
      await screen.findByText("There is nothing here to confirm."),
    ).toBeInTheDocument();
  });

  it("refuses an address that is not a number without asking the server", async () => {
    renderPage("not-a-number");

    expect(
      await screen.findByText("There is nothing here to confirm."),
    ).toBeInTheDocument();
    expect(fetchLogbookConfirmation).not.toHaveBeenCalled();
  });

  it("shows what the server said when an answer is refused", async () => {
    const user = userEvent.setup();
    answerLogbookConfirmation.mockRejectedValue(
      new Error("That entry has already been confirmed."),
    );
    renderPage();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Confirm entry" }));

    expect(
      await screen.findByText("That entry has already been confirmed."),
    ).toBeInTheDocument();
  });
});
