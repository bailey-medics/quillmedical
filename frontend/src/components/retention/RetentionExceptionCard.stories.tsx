/**
 * Retention Exception Card Storybook Stories
 *
 * An account marked to be emptied that the nightly run did not empty, in
 * each of the three ways that happens.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import type { RetentionException } from "@/lib/retention/retentionReviews";
import RetentionExceptionCard from "./RetentionExceptionCard";

/** A made-up person. Not, and not like, a real account. */
const exception: RetentionException = {
  id: 1,
  user_id: 42,
  full_name: "Alex Example",
  email: "alex.example@example.nhs.uk",
  closed_at: "2028-01-14T09:00:00Z",
  due_on: "2030-01-14T09:00:00Z",
  reason: "failed",
  detail: "The account has a passport and there is no archive to move it to.",
  noted_at: "2030-02-03T03:30:00Z",
};

const meta: Meta<typeof RetentionExceptionCard> = {
  title: "Retention/Retention exception card",
  component: RetentionExceptionCard,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof RetentionExceptionCard>;

/** Could not be emptied, and tried again each night */
export const Default: Story = {
  args: { exception },
};

/** Each way an account is not emptied */
export const AllStates: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="could not be emptied (default)" horizontal={false}>
        <RetentionExceptionCard exception={exception} />
      </VariantRow>
      <VariantRow label="opened again" horizontal={false}>
        <RetentionExceptionCard
          exception={{ ...exception, reason: "opened_again", detail: null }}
        />
      </VariantRow>
      <VariantRow label="has training records again" horizontal={false}>
        <RetentionExceptionCard
          exception={{ ...exception, reason: "has_records", detail: null }}
        />
      </VariantRow>
    </VariantStack>
  ),
};
