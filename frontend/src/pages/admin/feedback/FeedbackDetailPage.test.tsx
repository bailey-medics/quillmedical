/**
 * FeedbackDetailPage tests
 *
 * One piece of feedback in full, and changing its status.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiLib from "@/lib/api";
import type { FeedbackItem } from "@/lib/feedback/feedbackAdmin";
import FeedbackDetailPage from "./FeedbackDetailPage";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "5" }),
  };
});

const feedback: FeedbackItem = {
  id: 5,
  status: "new",
  category: "inaccurate",
  message: "The dose in case 4 is ten times too high.",
  sender: "delegate.one",
  route: "/teaching/:bankId",
  release: "abc1234",
  viewport: "390x844",
  user_agent: "Mozilla/5.0 (Macintosh)",
  breadcrumbs: [],
  error_name: "TypeError",
  error_code: "BANK_NOT_FOUND",
  created_at: "2026-09-20T10:00:00Z",
};

describe("FeedbackDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the whole message and where it was sent from", async () => {
    const get = vi.spyOn(apiLib.api, "get").mockResolvedValue(feedback);

    renderWithRouter(<FeedbackDetailPage />);

    expect(
      await screen.findByText("The dose in case 4 is ten times too high."),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/feedback/5");
    expect(screen.getByText("delegate.one")).toBeInTheDocument();
    expect(
      screen.getByText("Something is wrong or inaccurate"),
    ).toBeInTheDocument();
    expect(screen.getByText("/teaching/:bankId")).toBeInTheDocument();
    expect(screen.getByText("TypeError (BANK_NOT_FOUND)")).toBeInTheDocument();
    expect(screen.getByText("Mozilla/5.0 (Macintosh)")).toBeInTheDocument();
  });

  it("leaves the error out when it was not sent from one", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      ...feedback,
      error_name: null,
      error_code: null,
    });

    renderWithRouter(<FeedbackDetailPage />);

    await screen.findByText("The dose in case 4 is ten times too high.");
    expect(screen.queryByText("Error:")).not.toBeInTheDocument();
  });

  it("changes the status", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(feedback);
    const patch = vi
      .spyOn(apiLib.api, "patch")
      .mockResolvedValue({ ...feedback, status: "resolved" });

    renderWithRouter(<FeedbackDetailPage />);

    await user.click(await screen.findByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Resolved" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/feedback/5", {
        status: "resolved",
      }),
    );
    expect(await screen.findByRole("combobox", { name: "Status" })).toHaveValue(
      "Resolved",
    );
  });

  it("keeps the old status when the change fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(feedback);
    vi.spyOn(apiLib.api, "patch").mockRejectedValue(new Error("HTTP 500"));

    renderWithRouter(<FeedbackDetailPage />);

    await user.click(await screen.findByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Resolved" }));

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
        "New",
      ),
    );
  });

  it("says when the feedback cannot be found", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("HTTP 404"));

    renderWithRouter(<FeedbackDetailPage />);

    expect(await screen.findByText("Feedback not found")).toBeInTheDocument();
  });
});
