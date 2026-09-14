/**
 * LogbookEntryForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import LogbookEntryForm from "./LogbookEntryForm";
import { signedOffCompetency } from "./fixtures";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof LogbookEntryForm> = {
  title: "Passport/Logbook entry form",
  component: LogbookEntryForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof LogbookEntryForm>;

export const Default: Story = {
  args: {
    competency: signedOffCompetency,
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const Submitting: Story = {
  args: {
    competency: signedOffCompetency,
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: true,
  },
};

/**
 * Self-declared, and nothing here pretends otherwise.
 */
export const NobodyCountersignsThis: Story = {
  render: (args) => (
    <Stack gap="sm">
      <LogbookEntryForm {...args} />
      <StoryNote>
        No declaration, no assessor and no target. A logbook proves activity,
        not competence — it is the sign-off that turns evidence into a
        conclusion. Only the date is required; failures and abandoned attempts
        belong in the record as much as successes do.
      </StoryNote>
    </Stack>
  ),
  args: {
    competency: signedOffCompetency,
    onSubmit: fn(),
    onCancel: fn(),
  },
};
