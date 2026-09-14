/**
 * SignOffRequestForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import SignOffRequestForm from "./SignOffRequestForm";
import { requestedCompetency, signedOffCompetency } from "./fixtures";
import { StoryNote } from "@/stories/variants";

const assessors = [
  { value: "42", label: "Dr Amara Okonkwo — Consultant respiratory physician" },
  { value: "43", label: "Dr Ravi Patel — Consultant oncologist" },
  { value: "44", label: "Dr Helen Roberts — Consultant haematologist" },
];

const levels = [
  { id: "supervised", name: "Can perform with supervision available" },
  { id: "unsupervised", name: "Can perform independently" },
];

const meta: Meta<typeof SignOffRequestForm> = {
  title: "Passport/Sign-off request form",
  component: SignOffRequestForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SignOffRequestForm>;

export const Default: Story = {
  args: {
    competency: requestedCompetency,
    assessors,
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const WithLevels: Story = {
  args: {
    competency: signedOffCompetency,
    assessors,
    levels,
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const Submitting: Story = {
  args: {
    competency: requestedCompetency,
    assessors,
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: true,
  },
};

/**
 * The holder chooses their assessor — the list is not filtered by who is
 * "allowed" to sign.
 */
export const TheHolderChooses: Story = {
  render: (args) => (
    <Stack gap="sm">
      <SignOffRequestForm {...args} />
      <StoryNote>
        Nobody is filtered out. Who is fit to assess whom varies by procedure,
        department and the people involved, and a rule table encoding it would
        be wrong somewhere on the day it shipped. The one rule the API enforces
        is that it cannot be the holder themselves.
      </StoryNote>
    </Stack>
  ),
  args: {
    competency: requestedCompetency,
    assessors,
    onSubmit: fn(),
    onCancel: fn(),
  },
};
