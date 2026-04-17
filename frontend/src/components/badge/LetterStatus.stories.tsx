/**
 * LetterStatus Badge Storybook Stories
 *
 * Demonstrates the LetterStatus component across all statuses and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import LetterStatus from "./LetterStatus";
import type { LetterStatusType } from "./LetterStatus";

const meta: Meta<typeof LetterStatus> = {
  title: "Badge/LetterStatus",
  component: LetterStatus,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "select",
      options: ["final", "draft", "amended"],
      description: "Letter status",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "Badge size",
    },
  },
};

export default meta;
type Story = StoryObj<typeof LetterStatus>;

const allStatuses: LetterStatusType[] = ["final", "draft", "amended"];

/** Shows all statuses with default large size. */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      {allStatuses.map((status) => (
        <LetterStatus key={status} status={status} />
      ))}
    </Group>
  ),
};

/** All sizes comparison across all statuses. */
export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow key={size} label={size === "lg" ? "lg (default)" : size}>
          {allStatuses.map((status) => (
            <LetterStatus key={status} status={status} size={size} />
          ))}
        </VariantRow>
      ))}
    </VariantStack>
  ),
};

/** Loading skeleton at each size. */
export const Loading: Story = {
  render: () => (
    <VariantStack>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <VariantRow
          key={size}
          label={size === "lg" ? "lg (default)" : size}
          horizontal={false}
        >
          <LetterStatus status="final" size={size} isLoading />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};
