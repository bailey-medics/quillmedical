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
import type { Appointment } from "./AppointmentsList";

const meta: Meta<typeof AppointmentsList> = {
  title: "Appointments/AppointmentsList",
  component: AppointmentsList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof AppointmentsList>;

const allStatusAppointments: Appointment[] = [
  ...fakeAppointments,
  {
    id: "appt-cancelled",
    title: "Cancelled — dermatology referral",
    date: "2025-09-05",
    time: "15:00",
    location: "City Hospital, Outpatients",
    clinician: "Dr Rachel Patel",
    clinicianRole: "Consultant Dermatologist",
    status: "cancelled",
    notes: "Cancelled by patient — symptoms resolved.",
  },
  {
    id: "appt-no-show",
    title: "Practice nurse — blood test",
    date: "2025-08-20",
    time: "08:30",
    location: "Meadowbrook Surgery, Treatment Room",
    clinician: "Nurse Sarah Mitchell",
    clinicianRole: "Practice Nurse",
    status: "no-show",
    notes: "Patient did not attend. Rescheduled for next week.",
  },
];

export const Default: Story = {
  args: {
    appointments: fakeAppointments,
  },
};

export const AllStatuses: Story = {
  args: {
    appointments: allStatusAppointments,
  },
};

export const UpcomingOnly: Story = {
  args: {
    appointments: fakeAppointments.filter((a) => a.status === "upcoming"),
  },
};

export const PastOnly: Story = {
  args: {
    appointments: fakeAppointments.filter((a) => a.status !== "upcoming"),
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
