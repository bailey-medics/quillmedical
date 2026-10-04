/**
 * InboxPage tests
 *
 * What is waiting on the person signed in, what was lately dealt with,
 * and the way from each line to where it is dealt with.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiLib from "@/lib/api";
import type { InboxItem } from "@/lib/inbox/inbox";
import InboxPage from "./InboxPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const fresh: InboxItem = {
  source: "feedback_new",
  id: 7,
  title: "Feedback from sam.patel",
  detail: "Something is broken",
  status: "New",
  created_at: "2026-10-04T10:00:00Z",
  done: false,
};

const resolved: InboxItem = {
  source: "feedback_new",
  id: 3,
  title: "Feedback from ada.lovelace",
  detail: "Suggestion",
  status: "Resolved",
  created_at: "2026-10-01T10:00:00Z",
  done: true,
};

/** Answer each list by its address. */
function mockInbox(waiting: InboxItem[], done: InboxItem[]) {
  return vi.spyOn(apiLib.api, "get").mockImplementation((path: string) =>
    Promise.resolve({
      items: path.endsWith("done=true") ? done : waiting,
    }),
  );
}

/** The card under one heading. */
function section(name: string): HTMLElement {
  const card = screen
    .getByRole("heading", { name })
    .closest("div.mantine-Card-root");
  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${name}`);
  return card;
}

describe("InboxPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("asks for what is waiting and for what was dealt with", async () => {
    const get = mockInbox([fresh], [resolved]);

    renderWithRouter(<InboxPage />);

    await screen.findByText("Feedback from sam.patel");
    expect(get).toHaveBeenCalledWith("/inbox/items?done=false");
    expect(get).toHaveBeenCalledWith("/inbox/items?done=true");
  });

  it("lists what is waiting apart from what is completed", async () => {
    mockInbox([fresh], [resolved]);

    renderWithRouter(<InboxPage />);
    await screen.findByText("Feedback from sam.patel");

    const waiting = within(section("Waiting on you"));
    expect(waiting.getByText("Feedback from sam.patel")).toBeInTheDocument();
    expect(waiting.getByText("Something is broken")).toBeInTheDocument();
    expect(
      waiting.queryByText("Feedback from ada.lovelace"),
    ).not.toBeInTheDocument();

    const completed = within(section("Completed"));
    expect(
      completed.getByText("Feedback from ada.lovelace"),
    ).toBeInTheDocument();
    expect(completed.getByText("Resolved")).toBeInTheDocument();
  });

  it("opens the feature's own page when a line is pressed", async () => {
    const user = userEvent.setup();
    mockInbox([fresh], [resolved]);

    renderWithRouter(<InboxPage />);
    await user.click(await screen.findByText("Feedback from sam.patel"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/feedback/7");
  });

  it("says so when nothing is waiting and nothing is done", async () => {
    mockInbox([], []);

    renderWithRouter(<InboxPage />);

    expect(
      await screen.findByText("Nothing is waiting on you"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing completed yet")).toBeInTheDocument();
  });

  it("says when the inbox cannot be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("HTTP 500"));

    renderWithRouter(<InboxPage />);

    expect(
      (await screen.findAllByText("Your inbox could not be loaded")).length,
    ).toBeGreaterThan(0);
  });
});
