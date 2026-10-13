/**
 * Retention Review Card Storybook Stories
 *
 * One closed account's training records awaiting a decision, in each of
 * the three choices and when a decision was refused. And the account
 * itself, once no records are left on it.
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import {
  oneYearOn,
  type RetentionAccount,
  type RetentionChoice,
  type RetentionReview,
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
  email: "cat.example@example.nhs.uk",
  closed_at: "2028-01-14T09:00:00Z",
  due_on: "2030-01-14T09:00:00Z",
  listed_at: "2030-01-15T03:30:00Z",
};

const meta: Meta<typeof RetentionReviewCard> = {
  title: "Retention/Retention review card",
  component: RetentionReviewCard,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof RetentionReviewCard>;

function Interactive({
  start,
  about = review,
}: {
  start: RetentionChoice;
  about?: RetentionReview | RetentionAccount;
}) {
  const [choice, setChoice] = useState<RetentionChoice>(start);
  const [note, setNote] = useState("");
  const [askAgainOn, setAskAgainOn] = useState<string | null>(oneYearOn());

  return (
    <RetentionReviewCard
      review={about}
      choice={choice}
      note={note}
      askAgainOn={askAgainOn}
      onChoiceChange={setChoice}
      onNoteChange={setNote}
      onAskAgainOnChange={setAskAgainOn}
    />
  );
}

/** Where every card starts. Nothing is sent for it. */
export const Default: Story = {
  render: () => <Interactive start="undecided" />,
};

/** Each choice, and a decision the server refused. */
export const AllStates: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="leave for later (default)" horizontal={false}>
        <Interactive start="undecided" />
      </VariantRow>
      <VariantRow label="delete" horizontal={false}>
        <Interactive start="delete" />
      </VariantRow>
      <VariantRow label="keep, with no reason yet" horizontal={false}>
        <Interactive start="keep" />
      </VariantRow>
      <VariantRow label="refused" horizontal={false}>
        <RetentionReviewCard
          review={review}
          choice="delete"
          note=""
          askAgainOn={oneYearOn()}
          onChoiceChange={() => undefined}
          onNoteChange={() => undefined}
          onAskAgainOnChange={() => undefined}
          refusal="This account is no longer past its period: it has been opened again, or the period has changed. Nothing was deleted."
        />
      </VariantRow>
      <VariantRow label="while sending" horizontal={false}>
        <RetentionReviewCard
          review={review}
          choice="keep"
          note="The sponsor asked us to hold these."
          askAgainOn={oneYearOn()}
          onChoiceChange={() => undefined}
          onNoteChange={() => undefined}
          onAskAgainOnChange={() => undefined}
          disabled
        />
      </VariantRow>
    </VariantStack>
  ),
};

/**
 * The account itself, closed two years with no records left. Choosing
 * to empty it marks it for the next nightly run.
 */
export const AnAccount: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="leave for later (default)" horizontal={false}>
        <Interactive start="undecided" about={account} />
      </VariantRow>
      <VariantRow label="empty" horizontal={false}>
        <Interactive start="delete" about={account} />
      </VariantRow>
      <VariantRow label="keep, with no reason yet" horizontal={false}>
        <Interactive start="keep" about={account} />
      </VariantRow>
    </VariantStack>
  ),
};
