/**
 * LetterStatus Badge Storybook Stories
 *
 * Demonstrates the LetterStatus component across all statuses.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import LetterStatusBadge from "./LetterStatusBadge";
import type { LetterStatusType } from "./LetterStatusBadge";

const meta: Meta<typeof LetterStatusBadge> = {
  title: "Badge/LetterStatusBadge",
  component: LetterStatusBadge,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    status: {
      control: "select",
      options: ["final", "draft", "amended"],
      description: "Letter status",
    },
  },
};

export default meta;
type Story = StoryObj<typeof LetterStatusBadge>;

const allStatuses: LetterStatusType[] = ["final", "draft", "amended"];

/** Shows all statuses. */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      {allStatuses.map((status) => (
        <LetterStatusBadge key={status} status={status} />
      ))}
    </Group>
  ),
};
