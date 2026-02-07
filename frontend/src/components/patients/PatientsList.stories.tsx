/**
 * PatientsList Component Stories
 *
 * Demonstrates the patient list component:
 * - Table of patients with demographics
 * - Profile picture avatars with gradient colors
 * - NHS number and contact information
 * - Sortable columns
 * - Click to open patient detail view
 * - Loading and empty states
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import PatientsList from "./PatientsList";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";

const meta: Meta<typeof PatientsList> = {
  title: "Patients/PatientsList",
  component: PatientsList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof PatientsList>;

export const Default: Story = {
  args: {
    patients: demoPatientsList,
  },
};

export const Loading: Story = {
  args: {
    patients: [],
    isLoading: true,
  },
};
