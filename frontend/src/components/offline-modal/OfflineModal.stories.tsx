/**
 * OfflineModal Component Stories
 *
 * Demonstrates the contextual offline modal shown when a user
 * attempts a navigation or mutation while offline.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Stack } from "@mantine/core";
import { StoryNote } from "@/stories/variants";
import OfflineModal from "./OfflineModal";

const meta: Meta<typeof OfflineModal> = {
  title: "Overlays/OfflineModal",
  component: OfflineModal,
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof OfflineModal>;

/** Default — modal open with offline message */
export const Default: Story = {
  args: {
    opened: true,
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <Stack gap="md">
        <StoryNote>
          Shown when a user attempts a navigation or API mutation while offline.
          Single &ldquo;OK&rdquo; button dismisses the modal.
        </StoryNote>
        <Story />
      </Stack>
    ),
  ],
};

/** Dark mode */
export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
