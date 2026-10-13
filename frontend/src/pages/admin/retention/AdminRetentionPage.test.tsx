/**
 * AdminRetentionPage tests
 *
 * The operator's list of records awaiting a decision: that nothing is
 * sent for a row left alone, that keeping needs a reason, and that a
 * refusal is shown beside the row it belongs to.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiLib from "@/lib/api";
import type {
  RetentionOutcome,
  RetentionReview,
} from "@/lib/retention/retentionReviews";
import AdminRetentionPage from "./AdminRetentionPage";

function review(over: Partial<RetentionReview>): RetentionReview {
  return {
    id: 1,
    user_id: 42,
    full_name: "Ann Example",
    email: "ann@example.nhs.uk",
    org_unit_id: 3,
    organisation: "Example Training Academy",
    closed_at: "2027-01-14T09:00:00Z",
    due_on: "2030-07-14T09:00:00Z",
    attempts: 3,
    enrolments: 1,
    listed_at: "2030-07-15T03:30:00Z",
    ...over,
  };
}

const ann = review({ id: 1 });
const bob = review({
  id: 2,
  user_id: 43,
  full_name: "Bob Example",
  email: "bob@example.nhs.uk",
});

function mockList(...lists: RetentionReview[][]) {
  const get = vi.spyOn(apiLib.api, "get");

  for (const reviews of lists) {
    get.mockResolvedValueOnce({ reviews });
  }
  get.mockResolvedValue({ reviews: lists[lists.length - 1] ?? [] });

  return get;
}

function mockOutcome(outcome: RetentionOutcome) {
  return vi.spyOn(apiLib.api, "post").mockResolvedValue(outcome);
}

/** The card for one person, found by their name. */
async function cardOf(name: string): Promise<HTMLElement> {
  const heading = await screen.findByText(name);
  const card = heading.closest(".mantine-Card-root");

  if (!(card instanceof HTMLElement)) throw new Error(`no card for ${name}`);

  return card;
}

async function choose(name: string, choice: string) {
  await userEvent.click(
    within(await cardOf(name)).getByRole("radio", { name: choice }),
  );
}

async function carryOut() {
  await userEvent.click(
    screen.getByRole("button", { name: "Carry out decisions" }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Carry out decisions" }),
  );
}

describe("AdminRetentionPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for the records awaiting a decision", async () => {
    const get = mockList([]);

    renderWithRouter(<AdminRetentionPage />);

    await waitFor(() => expect(get).toHaveBeenCalledWith("/retention/reviews"));
  });

  it("shows a card for each account", async () => {
    mockList([ann, bob]);

    renderWithRouter(<AdminRetentionPage />);

    expect(await screen.findByText("Ann Example")).toBeInTheDocument();
    expect(screen.getByText("Bob Example")).toBeInTheDocument();
  });

  it("says so when nothing is awaiting a decision", async () => {
    mockList([]);

    renderWithRouter(<AdminRetentionPage />);

    expect(
      await screen.findByText("Nothing is awaiting a decision"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Carry out decisions" }),
    ).not.toBeInTheDocument();
  });

  it("says so when the list cannot be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("boom"));

    renderWithRouter(<AdminRetentionPage />);

    expect(
      await screen.findByText(
        "The records awaiting a decision could not be loaded",
      ),
    ).toBeInTheDocument();
  });

  it("has nothing to carry out until something is marked", async () => {
    mockList([ann]);

    renderWithRouter(<AdminRetentionPage />);
    await screen.findByText("Ann Example");

    // The button pair marks itself aria-disabled and stays focusable, so
    // the proof is that pressing it opens nothing.
    const button = screen.getByRole("button", { name: "Carry out decisions" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends only the rows that were marked", async () => {
    mockList([ann, bob], [bob]);
    const post = mockOutcome({ deleted: 1, kept: 0, refused: [] });

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Delete these records");
    await carryOut();

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/retention/decisions", {
        decisions: [{ review_id: 1, decision: "delete" }],
      }),
    );
  });

  it("says what will happen before it happens", async () => {
    mockList([ann, bob]);
    mockOutcome({ deleted: 1, kept: 1, refused: [] });

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Delete these records");
    await choose("Bob Example", "Keep these records");
    await userEvent.type(
      within(await cardOf("Bob Example")).getByRole("textbox"),
      "Held for the sponsor.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Carry out decisions" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Delete the training records of 1 account/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/keep those of 1 account/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it("sends nothing if the confirmation is cancelled", async () => {
    mockList([ann]);
    const post = mockOutcome({ deleted: 1, kept: 0, refused: [] });

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Delete these records");
    await userEvent.click(
      screen.getByRole("button", { name: "Carry out decisions" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    expect(post).not.toHaveBeenCalled();
  });

  it("will not carry out a keep that has no reason", async () => {
    mockList([ann]);

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Keep these records");

    const button = screen.getByRole("button", { name: "Carry out decisions" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends the reason with a keep", async () => {
    mockList([ann], []);
    const post = mockOutcome({ deleted: 0, kept: 1, refused: [] });

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Keep these records");
    await userEvent.type(
      within(await cardOf("Ann Example")).getByRole("textbox"),
      "Held for the sponsor.",
    );
    await carryOut();

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/retention/decisions", {
        decisions: [
          { review_id: 1, decision: "keep", note: "Held for the sponsor." },
        ],
      }),
    );
  });

  it("says what was done, and lists again", async () => {
    const get = mockList([ann], []);
    mockOutcome({ deleted: 1, kept: 0, refused: [] });

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Delete these records");
    await carryOut();

    expect(
      await screen.findByText("Decisions carried out"),
    ).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Nothing is awaiting a decision"),
    ).toBeInTheDocument();
  });

  it("shows a refusal beside the account it belongs to", async () => {
    mockList([ann], [ann]);
    mockOutcome({
      deleted: 0,
      kept: 0,
      refused: [{ review_id: 1, reason: "Nothing was deleted." }],
    });

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Delete these records");
    await carryOut();

    expect(
      await within(await cardOf("Ann Example")).findByText(
        "Nothing was deleted.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("1 account could not be dealt with"),
    ).toBeInTheDocument();
  });

  it("says so, and that nothing was deleted, when the request fails", async () => {
    mockList([ann]);
    vi.spyOn(apiLib.api, "post").mockRejectedValue(new Error("boom"));

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Delete these records");
    await carryOut();

    expect(
      await screen.findByText("The decisions were not carried out"),
    ).toBeInTheDocument();
  });

  it("clears every choice", async () => {
    mockList([ann]);

    renderWithRouter(<AdminRetentionPage />);
    await choose("Ann Example", "Delete these records");
    await userEvent.click(
      screen.getByRole("button", { name: "Clear choices" }),
    );

    expect(
      within(await cardOf("Ann Example")).getByRole("radio", {
        name: "Leave for later",
      }),
    ).toBeChecked();
  });
});
