/**
 * AppointmentsList Component Stories
 *
 * Demonstrates the appointments list component:
 * - Upcoming appointments with blue left border and bold date
 * - Past appointments grouped separately
 * - Different statuses (upcoming, completed, cancelled, no-show)
 * - Loading skeleton state
 * - Empty list
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import AppointmentsList from "./AppointmentsList";
import { fakeAppointments } from "@/data/fakeAppointments";

const meta: Meta<typeof AppointmentsList> = {
  title: "Appointments/AppointmentsList",
  component: AppointmentsList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof AppointmentsList>;

export const Default: Story = {
  args: {
    appointments: fakeAppointments,
  },
};

export const Loading: Story = {
  args: {
    appointments: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    appointments: [],
  },
};
