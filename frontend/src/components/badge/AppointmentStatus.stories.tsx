/**
 * AppointmentStatus Badge Storybook Stories
 *
 * Demonstrates the AppointmentStatus component across all statuses and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import { VariantRow, VariantStack } from "@/stories/variants";
import AppointmentStatus from "./AppointmentStatus";
import type { AppointmentStatusType } from "./AppointmentStatus";

const meta: Meta<typeof AppointmentStatus> = {
  title: "Badge/AppointmentStatus",
  component: AppointmentStatus,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "select",
      options: ["upcoming", "completed", "cancelled", "no-show"],
      description: "Appointment status",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "Badge size",
    },
  },
};

export default meta;
type Story = StoryObj<typeof AppointmentStatus>;

const allStatuses: AppointmentStatusType[] = [
  "upcoming",
  "completed",
  "cancelled",
  "no-show",
];

/** Shows all statuses with default large size. */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      {allStatuses.map((status) => (
        <AppointmentStatus key={status} status={status} />
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
            <AppointmentStatus key={status} status={status} size={size} />
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
          <AppointmentStatus status="upcoming" size={size} isLoading />
        </VariantRow>
      ))}
    </VariantStack>
  ),
};
