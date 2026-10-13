/**
 * Retention Review Card Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import type {
  RetentionAccount,
  RetentionReview,
} from "@/lib/retention/retentionReviews";
import RetentionReviewCard from "./RetentionReviewCard";

const review: RetentionReview = {
  id: 1,
  user_id: 42,
  full_name: "Alex Example",
  email: "alex.example@example.nhs.uk",
  org_unit_id: 3,
  organisation: "Example Training Academy",
  closed_at: "2027-01-14T09:00:00Z",
  due_on: "2030-07-14T09:00:00Z",
  attempts: 3,
  enrolments: 1,
  listed_at: "2030-07-15T03:30:00Z",
};

const account: RetentionAccount = {
  id: 9,
  user_id: 44,
  full_name: "Cat Example",
  email: "cat@example.nhs.uk",
  closed_at: "2028-01-14T09:00:00Z",
  due_on: "2030-01-14T09:00:00Z",
  listed_at: "2030-01-15T03:30:00Z",
};

function renderCard(
  props: Partial<React.ComponentProps<typeof RetentionReviewCard>> = {},
) {
  const onChoiceChange = vi.fn();
  const onNoteChange = vi.fn();
  const onAskAgainOnChange = vi.fn();

  renderWithMantine(
    <RetentionReviewCard
      review={review}
      choice="undecided"
      note=""
      askAgainOn="2031-07-15"
      onChoiceChange={onChoiceChange}
      onNoteChange={onNoteChange}
      onAskAgainOnChange={onAskAgainOnChange}
      {...props}
    />,
  );

  return { onChoiceChange, onNoteChange, onAskAgainOnChange };
}

describe("RetentionReviewCard", () => {
  it("shows whose records they are and where", () => {
    renderCard();

    expect(screen.getByText("Alex Example")).toBeInTheDocument();
    expect(screen.getByText("alex.example@example.nhs.uk")).toBeInTheDocument();
    expect(screen.getByText("Example Training Academy")).toBeInTheDocument();
  });

  it("says what a decision to delete would remove", () => {
    renderCard();

    expect(screen.getByText("3 attempts and 1 enrolment")).toBeInTheDocument();
  });

  it("uses the singular for one attempt and the plural for none", () => {
    renderCard({ review: { ...review, attempts: 1, enrolments: 0 } });

    expect(screen.getByText("1 attempt and 0 enrolments")).toBeInTheDocument();
  });

  it("stands in for a missing name", () => {
    renderCard({ review: { ...review, full_name: "" } });

    expect(screen.getByText("No name recorded")).toBeInTheDocument();
  });

  it("starts on leave for later, with no note to write", () => {
    renderCard();

    expect(
      screen.getByRole("radio", { name: "Leave for later" }),
    ).toBeChecked();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("reports the choice that was picked", async () => {
    const { onChoiceChange } = renderCard();

    await userEvent.click(
      screen.getByRole("radio", { name: "Delete these records" }),
    );

    expect(onChoiceChange).toHaveBeenCalledWith("delete");
  });

  it("offers an optional note when deleting", () => {
    renderCard({ choice: "delete" });

    expect(screen.getByLabelText("Note (optional)")).toBeInTheDocument();
    expect(
      screen.queryByText("A reason is needed to keep"),
    ).not.toBeInTheDocument();
  });

  it("asks for a reason when keeping, and says so until one is given", () => {
    renderCard({ choice: "keep" });

    expect(screen.getByText("A reason is needed to keep")).toBeInTheDocument();
  });

  it("stops asking once a reason is written", () => {
    renderCard({ choice: "keep", note: "The sponsor asked us to hold these." });

    expect(
      screen.queryByText("A reason is needed to keep"),
    ).not.toBeInTheDocument();
  });

  it("treats a note of only spaces as no reason", () => {
    renderCard({ choice: "keep", note: "   " });

    expect(screen.getByText("A reason is needed to keep")).toBeInTheDocument();
  });

  it("reports the note as it is typed", async () => {
    const { onNoteChange } = renderCard({ choice: "keep" });

    await userEvent.type(
      screen.getByRole("textbox", { name: /Why they are being kept/ }),
      "H",
    );

    expect(onNoteChange).toHaveBeenCalledWith("H");
  });

  it("shows when a keep will be asked about again", () => {
    renderCard({ choice: "keep", note: "Held." });

    expect(screen.getByLabelText(/Ask again on/)).toHaveValue("15 July 2031");
  });

  it("asks for no date when deleting or leaving for later", () => {
    renderCard({ choice: "delete" });

    expect(screen.queryByLabelText(/Ask again on/)).not.toBeInTheDocument();
  });

  it("says a date is needed when it has been cleared", () => {
    renderCard({ choice: "keep", note: "Held.", askAgainOn: null });

    expect(screen.getByText("A date is needed to keep")).toBeInTheDocument();
  });

  it("shows why a decision was refused", () => {
    renderCard({ choice: "delete", refusal: "Nothing was deleted." });

    expect(screen.getByText("Nothing was deleted.")).toBeInTheDocument();
  });

  it("cannot be changed while the decisions are being sent", () => {
    renderCard({ choice: "keep", note: "Held.", disabled: true });

    expect(
      screen.getByRole("radio", { name: "Delete these records" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: /Why they are being kept/ }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/Ask again on/)).toBeDisabled();
  });

  describe("for the account itself", () => {
    it("offers to empty or keep the account, not its records", () => {
      renderCard({ review: account });

      expect(
        screen.getByRole("radio", { name: "Empty this account" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Keep this account" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("radio", { name: "Delete these records" }),
      ).not.toBeInTheDocument();
    });

    it("names no organisation and counts no records", () => {
      renderCard({ review: account });

      expect(screen.queryByText("Organisation:")).not.toBeInTheDocument();
      expect(screen.queryByText("Would be deleted:")).not.toBeInTheDocument();
      expect(screen.getByText("Would be emptied:")).toBeInTheDocument();
    });

    it("says the nightly run empties it, not this screen", () => {
      renderCard({ review: account });

      expect(
        screen.getByText("the account itself, by the next nightly run"),
      ).toBeInTheDocument();
    });

    it("sends the same choice as deleting records does", async () => {
      const { onChoiceChange } = renderCard({ review: account });

      await userEvent.click(
        screen.getByRole("radio", { name: "Empty this account" }),
      );

      expect(onChoiceChange).toHaveBeenCalledWith("delete");
    });

    it("asks why an account is kept", () => {
      renderCard({ review: account, choice: "keep" });

      expect(
        screen.getByRole("textbox", { name: /Why it is being kept/ }),
      ).toBeInTheDocument();
    });
  });
});
