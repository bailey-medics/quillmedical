/**
 * Retention Review Card Storybook Stories
 *
 * One closed account's training records awaiting a decision, in each of
 * the three choices and when a decision was refused.
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import type {
  RetentionChoice,
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

const meta: Meta<typeof RetentionReviewCard> = {
  title: "Retention/Retention review card",
  component: RetentionReviewCard,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof RetentionReviewCard>;

function Interactive({ start }: { start: RetentionChoice }) {
  const [choice, setChoice] = useState<RetentionChoice>(start);
  const [note, setNote] = useState("");

  return (
    <RetentionReviewCard
      review={review}
      choice={choice}
      note={note}
      onChoiceChange={setChoice}
      onNoteChange={setNote}
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
          onChoiceChange={() => undefined}
          onNoteChange={() => undefined}
          refusal="This account is no longer past its period: it has been opened again, or the period has changed. Nothing was deleted."
        />
      </VariantRow>
      <VariantRow label="while sending" horizontal={false}>
        <RetentionReviewCard
          review={review}
          choice="keep"
          note="The sponsor asked us to hold these."
          onChoiceChange={() => undefined}
          onNoteChange={() => undefined}
          disabled
        />
      </VariantRow>
    </VariantStack>
  ),
};
