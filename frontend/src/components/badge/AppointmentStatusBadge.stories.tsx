/**
 * AppointmentStatus Badge Storybook Stories
 *
 * Demonstrates the AppointmentStatus component across all statuses and sizes.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import AppointmentStatusBadge from "./AppointmentStatusBadge";
import type { AppointmentStatusType } from "./AppointmentStatusBadge";

const meta: Meta<typeof AppointmentStatusBadge> = {
  title: "Badge/AppointmentStatusBadge",
  component: AppointmentStatusBadge,
  parameters: {
    layout: "padded",
  },
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
type Story = StoryObj<typeof AppointmentStatusBadge>;

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
        <AppointmentStatusBadge key={status} status={status} />
      ))}
    </Group>
  ),
};
