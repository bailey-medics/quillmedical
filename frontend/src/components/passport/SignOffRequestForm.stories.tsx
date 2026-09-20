/**
 * SignOffRequestForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import SignOffRequestForm from "./SignOffRequestForm";
import { requestedCompetency, signedOffCompetency } from "./fixtures";
import { StoryNote } from "@/stories/variants";

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
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const WithLevels: Story = {
  args: {
    competency: signedOffCompetency,
    levels,
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const Submitting: Story = {
  args: {
    competency: requestedCompetency,
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: true,
  },
};

/**
 * The assessor is named by email, so somebody with no Quill account can
 * still be asked.
 */
export const AnAssessorFromAnywhere: Story = {
  render: (args) => (
    <Stack gap="sm">
      <SignOffRequestForm {...args} />
      <StoryNote>
        The consultant who observed the work is often at another trust, or not
        on Quill at all — which is the case this feature exists for. A list of
        existing users had no row for them, so the holder could not ask. They
        are emailed, and sign in or register to sign.
      </StoryNote>
    </Stack>
  ),
  args: {
    competency: requestedCompetency,
    onSubmit: fn(),
    onCancel: fn(),
  },
};
