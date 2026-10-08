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

/** Correcting an entry: filled in from it, saving rather than adding. */
export const Editing: Story = {
  args: {
    competency: signedOffCompetency,
    initial: {
      filename: "20260314T1432",
      competency: signedOffCompetency.id,
      performed_on: "2026-03-14",
      setting: "Bronchoscopy suite",
      supervision: "supervised",
      supervisor: "Dr Okonkwo",
      indication: "Suspected lung cancer",
      outcome: "Biopsies taken",
      notes: null,
      also_counts_towards: [],
      attachments: [],
    },
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
        not competence - it is the sign-off that turns evidence into a
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

/**
 * A competency signed off scope by scope asks for the scope here too,
 * and the entry cannot be added without it, exactly as on a sign-off.
 */
export const WithScopes: Story = {
  args: {
    competency: signedOffCompetency,
    scopes: [
      { id: "breast", name: "Breast" },
      { id: "lung", name: "Lung" },
      { id: "other", name: "Other" },
    ],
    onSubmit: fn(),
    onCancel: fn(),
  },
};
