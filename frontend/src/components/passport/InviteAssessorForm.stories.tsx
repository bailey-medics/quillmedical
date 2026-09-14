/**
 * InviteAssessorForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import InviteAssessorForm from "./InviteAssessorForm";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof InviteAssessorForm> = {
  title: "Passport/Invite assessor form",
  component: InviteAssessorForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof InviteAssessorForm>;

export const Default: Story = {
  args: {
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const WithShortlist: Story = {
  args: {
    onSubmit: fn(),
    onCancel: fn(),
    commonlyUsedHere: ["prescribe_sact", "perform_bronchoscopy"],
  },
};

export const Submitting: Story = {
  args: {
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: true,
  },
};

/**
 * The registration is declared, not checked — and the form says so.
 */
export const QuillChecksNoRegister: Story = {
  render: (args) => (
    <Stack gap="sm">
      <InviteAssessorForm {...args} />
      <StoryNote>
        Quill checks no register. The number is what the holder was told, the
        assessor confirms it on acceptance, and an administrator verifies it by
        hand later — so the panel says that plainly rather than letting the
        field imply the number has been validated.
      </StoryNote>
    </Stack>
  ),
  args: {
    onSubmit: fn(),
    onCancel: fn(),
  },
};
