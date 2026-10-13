/**
 * Retention Decision List Tests
 *
 * What is handed to `onCarryOut`, and when: only the accounts that were
 * marked, only after the confirmation, and never a keep with no reason.
 */

import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import {
  oneYearOn,
  type RetentionReview,
} from "@/lib/retention/retentionReviews";
import RetentionDecisionList from "./RetentionDecisionList";

function review(id: number, full_name: string): RetentionReview {
  return {
    id,
    user_id: 100 + id,
    full_name,
    email: `${full_name.split(" ")[0].toLowerCase()}@example.nhs.uk`,
    org_unit_id: 3,
    organisation: "Example Training Academy",
    closed_at: "2027-01-14T09:00:00Z",
    due_on: "2030-07-14T09:00:00Z",
    attempts: 3,
    enrolments: 1,
    listed_at: "2030-07-15T03:30:00Z",
  };
}

const ann = review(1, "Ann Example");
const bob = review(2, "Bob Example");

function renderList(
  props: Partial<React.ComponentProps<typeof RetentionDecisionList>> = {},
) {
  const onCarryOut = vi.fn().mockResolvedValue(undefined);
  const onClear = vi.fn();

  renderWithMantine(
    <RetentionDecisionList
      reviews={[ann, bob]}
      onCarryOut={onCarryOut}
      onClear={onClear}
      {...props}
    />,
  );

  return { onCarryOut, onClear };
}

function cardOf(name: string): HTMLElement {
  const card = screen.getByText(name).closest(".mantine-Card-root");

  if (!(card instanceof HTMLElement)) throw new Error(`no card for ${name}`);

  return card;
}

async function choose(name: string, choice: string) {
  await userEvent.click(
    within(cardOf(name)).getByRole("radio", { name: choice }),
  );
}

async function confirm() {
  await userEvent.click(
    screen.getByRole("button", { name: "Carry out decisions" }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Carry out decisions" }),
  );
}

describe("RetentionDecisionList", () => {
  it("shows a card for each account", () => {
    renderList();

    expect(screen.getByText("Ann Example")).toBeInTheDocument();
    expect(screen.getByText("Bob Example")).toBeInTheDocument();
  });

  it("has nothing to carry out until something is marked", async () => {
    const { onCarryOut } = renderList();

    const button = screen.getByRole("button", { name: "Carry out decisions" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onCarryOut).not.toHaveBeenCalled();
  });

  it("hands over only the accounts that were marked", async () => {
    const { onCarryOut } = renderList();

    await choose("Ann Example", "Delete these records");
    await confirm();

    await waitFor(() =>
      expect(onCarryOut).toHaveBeenCalledWith([
        { review_id: 1, decision: "delete" },
      ]),
    );
  });

  it("hands over nothing before the confirmation is accepted", async () => {
    const { onCarryOut } = renderList();

    await choose("Ann Example", "Delete these records");
    await userEvent.click(
      screen.getByRole("button", { name: "Carry out decisions" }),
    );
    await screen.findByRole("dialog");

    expect(onCarryOut).not.toHaveBeenCalled();
  });

  it("counts what will be deleted and kept in the confirmation", async () => {
    renderList();

    await choose("Ann Example", "Delete these records");
    await choose("Bob Example", "Keep these records");
    await userEvent.type(
      within(cardOf("Bob Example")).getByRole("textbox", { name: /Why/ }),
      "Held.",
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
  });

  it("will not carry out a keep that has no reason", async () => {
    const { onCarryOut } = renderList();

    await choose("Ann Example", "Keep these records");
    const button = screen.getByRole("button", { name: "Carry out decisions" });
    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(onCarryOut).not.toHaveBeenCalled();
  });

  it("hands over the reason and the date with a keep", async () => {
    const { onCarryOut } = renderList();

    await choose("Bob Example", "Keep these records");
    await userEvent.type(
      within(cardOf("Bob Example")).getByRole("textbox", { name: /Why/ }),
      "  Held for the sponsor.  ",
    );
    await confirm();

    await waitFor(() =>
      expect(onCarryOut).toHaveBeenCalledWith([
        {
          review_id: 2,
          decision: "keep",
          note: "Held for the sponsor.",
          ask_again_on: `${oneYearOn()}T00:00:00Z`,
        },
      ]),
    );
  });

  it("hands over the date that was chosen, not the default", async () => {
    const { onCarryOut } = renderList();

    await choose("Bob Example", "Keep these records");
    await userEvent.type(
      within(cardOf("Bob Example")).getByRole("textbox", { name: /Why/ }),
      "A long dispute.",
    );
    const date = within(cardOf("Bob Example")).getByLabelText(/Ask again on/);
    await userEvent.clear(date);
    await userEvent.type(date, "1 March 2099");
    await userEvent.tab();
    await confirm();

    await waitFor(() =>
      expect(onCarryOut).toHaveBeenCalledWith([
        {
          review_id: 2,
          decision: "keep",
          note: "A long dispute.",
          ask_again_on: "2099-03-01T00:00:00Z",
        },
      ]),
    );
  });

  it("sends no date with a delete", async () => {
    const { onCarryOut } = renderList();

    await choose("Ann Example", "Delete these records");
    await confirm();

    await waitFor(() => expect(onCarryOut).toHaveBeenCalled());
    expect(onCarryOut.mock.calls[0][0][0]).not.toHaveProperty("ask_again_on");
  });

  it("leaves out a note that is only spaces on a delete", async () => {
    const { onCarryOut } = renderList();

    await choose("Ann Example", "Delete these records");
    await userEvent.type(
      within(cardOf("Ann Example")).getByRole("textbox"),
      "  ",
    );
    await confirm();

    await waitFor(() =>
      expect(onCarryOut).toHaveBeenCalledWith([
        { review_id: 1, decision: "delete" },
      ]),
    );
  });

  it("shows a refusal beside the account it belongs to", () => {
    renderList({ refusals: { 2: "Nothing was deleted." } });

    expect(
      within(cardOf("Bob Example")).getByText("Nothing was deleted."),
    ).toBeInTheDocument();
    expect(
      within(cardOf("Ann Example")).queryByText("Nothing was deleted."),
    ).not.toBeInTheDocument();
  });

  it("clears every choice, and says it has", async () => {
    const { onClear } = renderList();

    await choose("Ann Example", "Delete these records");
    await userEvent.click(
      screen.getByRole("button", { name: "Clear choices" }),
    );

    expect(
      within(cardOf("Ann Example")).getByRole("radio", {
        name: "Leave for later",
      }),
    ).toBeChecked();
    expect(onClear).toHaveBeenCalled();
  });

  it("closes the confirmation once the decisions are carried out", async () => {
    renderList();

    await choose("Ann Example", "Delete these records");
    await confirm();

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
