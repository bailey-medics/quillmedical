/**
 * AdminFeedbackPage tests
 *
 * The operator's list of feedback: what it shows, how it narrows to one
 * status, and that a row opens the detail page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiLib from "@/lib/api";
import type { FeedbackItem } from "@/lib/feedback/feedbackAdmin";
import AdminFeedbackPage from "./AdminFeedbackPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function item(over: Partial<FeedbackItem>): FeedbackItem {
  return {
    id: 1,
    status: "new",
    category: "broken",
    message: "Captions lag behind the video",
    sender: "delegate.one",
    route: "/teaching/:bankId",
    release: "abc1234",
    viewport: "390x844",
    user_agent: "Mozilla/5.0",
    breadcrumbs: [],
    error_name: null,
    error_code: null,
    created_at: "2026-09-20T10:00:00Z",
    ...over,
  };
}

const open = item({ id: 1 });
const done = item({
  id: 2,
  status: "resolved",
  category: null,
  message: "The dose in case 4 was wrong",
  sender: null,
});

function mockList(items: FeedbackItem[]) {
  return vi.spyOn(apiLib.api, "get").mockResolvedValue({ items });
}

describe("AdminFeedbackPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("asks for the feedback list", async () => {
    const get = mockList([]);

    renderWithRouter(<AdminFeedbackPage />);

    await waitFor(() => expect(get).toHaveBeenCalledWith("/feedback"));
  });

  it("shows each item's status, sender, category and message", async () => {
    mockList([open, done]);

    renderWithRouter(<AdminFeedbackPage />);

    expect(
      await screen.findAllByText("Captions lag behind the video"),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("delegate.one").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Something is broken").length).toBeGreaterThan(
      0,
    );
  });

  it("names a deleted sender and a missing category plainly", async () => {
    mockList([done]);

    renderWithRouter(<AdminFeedbackPage />);

    expect((await screen.findAllByText("Deleted user")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Not given").length).toBeGreaterThan(0);
  });

  it("shows only the start of a long message", async () => {
    mockList([item({ message: "x".repeat(200) })]);

    renderWithRouter(<AdminFeedbackPage />);

    expect(
      (await screen.findAllByText(`${"x".repeat(80)}…`)).length,
    ).toBeGreaterThan(0);
  });

  it("opens the detail page from a row", async () => {
    const user = userEvent.setup();
    mockList([open]);

    renderWithRouter(<AdminFeedbackPage />);

    const [cell] = await screen.findAllByText("Captions lag behind the video");
    await user.click(cell);

    expect(mockNavigate).toHaveBeenCalledWith("/admin/feedback/1");
  });

  it("says when there is no feedback", async () => {
    mockList([]);

    renderWithRouter(<AdminFeedbackPage />);

    expect(await screen.findByText("No feedback yet")).toBeInTheDocument();
  });

  it("says when the list could not be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("HTTP 403"));

    renderWithRouter(<AdminFeedbackPage />);

    expect(
      await screen.findByText("Feedback could not be loaded"),
    ).toBeInTheDocument();
  });
});
