/**
 * YourFeedbackPage tests
 *
 * The sender's own feedback, with the status in words that mean something
 * to them rather than the operator's triage labels.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import * as apiLib from "@/lib/api";
import type { MyFeedbackItem } from "@/lib/feedback/myFeedback";
import YourFeedbackPage from "./YourFeedbackPage";

const fixed: MyFeedbackItem = {
  id: 2,
  status: "resolved",
  category: "inaccurate",
  message: "The dose in case 4 was wrong.",
  created_at: "2026-09-21T10:00:00Z",
};

const received: MyFeedbackItem = {
  id: 1,
  status: "new",
  category: null,
  message: "Captions lag behind the video.",
  created_at: "2026-09-20T10:00:00Z",
};

describe("YourFeedbackPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for the caller's own feedback", async () => {
    const get = vi.spyOn(apiLib.api, "get").mockResolvedValue({ items: [] });

    renderWithRouter(<YourFeedbackPage />);

    await waitFor(() => expect(get).toHaveBeenCalledWith("/feedback/mine"));
  });

  it("shows each message with its status in the sender's words", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      items: [fixed, received],
    });

    renderWithRouter(<YourFeedbackPage />);

    expect(
      await screen.findByText("The dose in case 4 was wrong."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Captions lag behind the video."),
    ).toBeInTheDocument();
    expect(screen.getByText("Fixed")).toBeInTheDocument();
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.queryByText("Resolved")).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("shows the category when one was chosen", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ items: [fixed] });

    renderWithRouter(<YourFeedbackPage />);

    expect(
      await screen.findByText(/Something is wrong or inaccurate/),
    ).toBeInTheDocument();
  });

  it("says so when nothing has been sent", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ items: [] });

    renderWithRouter(<YourFeedbackPage />);

    expect(
      await screen.findByText(/You have not sent any feedback yet/),
    ).toBeInTheDocument();
  });

  it("says so when the list cannot be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("HTTP 500"));

    renderWithRouter(<YourFeedbackPage />);

    expect(
      await screen.findByText(
        "Your feedback could not be loaded. Please try again later.",
      ),
    ).toBeInTheDocument();
  });
});
