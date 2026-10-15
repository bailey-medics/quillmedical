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
  type RetentionAccount,
  type RetentionReview,
} from "@/lib/retention/retentionReviews";
import RetentionDecisionList from "./RetentionDecisionList";
import type { RetentionDecision } from "@/lib/retention/retentionReviews";

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

const cat: RetentionAccount = {
  id: 9,
  user_id: 109,
  full_name: "Cat Example",
  email: "cat@example.nhs.uk",
  closed_at: "2028-01-14T09:00:00Z",
  due_on: "2030-01-14T09:00:00Z",
  listed_at: "2030-01-15T03:30:00Z",
};

const ann = review(1, "Ann Example");
const bob = review(2, "Bob Example");

function renderList(
  props: Partial<React.ComponentProps<typeof RetentionDecisionList>> = {},
) {
  const onCarryOut = vi
    .fn<(decisions: RetentionDecision[]) => Promise<void>>()
    .mockResolvedValue(undefined);
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

/** Pick the date to ask again on: none is offered. */
async function pickDate(card: HTMLElement) {
  const date = within(card).getByLabelText(/Ask again on/);

  await userEvent.type(date, "1 March 2099");
  await userEvent.tab();
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
    await pickDate(cardOf("Bob Example"));
    await userEvent.click(
      screen.getByRole("button", { name: "Carry out decisions" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Delete the training records of 1 account/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/keep 1 as marked/)).toBeInTheDocument();
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
    await pickDate(cardOf("Bob Example"));
    await confirm();

    await waitFor(() =>
      expect(onCarryOut).toHaveBeenCalledWith([
        {
          review_id: 2,
          decision: "keep",
          note: "Held for the sponsor.",
          ask_again_on: "2099-03-01T00:00:00Z",
        },
      ]),
    );
  });

  it("offers no date, and will not carry out a keep until one is picked", async () => {
    const { onCarryOut } = renderList();

    await choose("Bob Example", "Keep these records");
    await userEvent.type(
      within(cardOf("Bob Example")).getByRole("textbox", { name: /Why/ }),
      "Held for the sponsor.",
    );
    const button = screen.getByRole("button", { name: "Carry out decisions" });
    await userEvent.click(button);

    expect(
      within(cardOf("Bob Example")).getByLabelText(/Ask again on/),
    ).toHaveValue("");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(onCarryOut).not.toHaveBeenCalled();
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

  it("shows an account to be emptied after the records", () => {
    renderList({ accounts: [cat] });

    const names = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);

    expect(names).toEqual(["Ann Example", "Bob Example", "Cat Example"]);
  });

  it("counts an account marked to be emptied apart from records", async () => {
    const { onCarryOut } = renderList({ accounts: [cat] });

    await userEvent.click(
      within(cardOf("Ann Example")).getByRole("radio", {
        name: "Delete these records",
      }),
    );
    await userEvent.click(
      within(cardOf("Cat Example")).getByRole("radio", {
        name: "Empty this account",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Carry out decisions" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/training records of 1 account/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/mark 1 account to be emptied/),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Carry out decisions" }),
    );

    await waitFor(() =>
      expect(onCarryOut).toHaveBeenCalledWith([
        { review_id: 1, decision: "delete" },
        { review_id: 9, decision: "delete" },
      ]),
    );
  });
});
