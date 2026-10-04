/**
 * ReflectionEditor Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import ReflectionEditor from "./ReflectionEditor";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof ReflectionEditor> = {
  title: "Passport/Reflection editor",
  component: ReflectionEditor,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof ReflectionEditor>;

export const Default: Story = {
  args: {
    onSubmit: fn(),
    onCancel: fn(),
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
 * The anonymisation tick is required rather than suggested.
 */
export const Anonymised: Story = {
  render: (args) => (
    <Stack gap="sm">
      <ReflectionEditor {...args} />
      <StoryNote>
        The anonymisation declaration is firmer than the logbook&rsquo;s passive
        note and must be ticked: a reflection is written about a real person,
        and the API refuses the write without it.
      </StoryNote>
    </Stack>
  ),
  args: {
    onSubmit: fn(),
    onCancel: fn(),
  },
};
