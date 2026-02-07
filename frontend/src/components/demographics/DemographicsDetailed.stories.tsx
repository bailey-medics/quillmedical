import { demoPatientsList } from "@/demo-data/patients/demoPatients";
/**
 * DemographicsDetailed Component Stories
 *
 * Demonstrates the detailed patient demographics view:
 * - Full patient information display
 * - Contact details (address, phone, email)
 * - Medical identifiers (NHS number, MRN)
 * - Next of kin information
 * - Formatted date of birth and age
 * - Gender display with icons
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import DemographicsDetailed from "./DemographicsDetailed";

const meta: Meta<typeof DemographicsDetailed> = {
  title: "Demographics/DemographicsDetailed",
  component: DemographicsDetailed,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof DemographicsDetailed>;

// use demo patient from centralized demo-data

export const Default: Story = {
  args: {
    patient: demoPatientsList[0],
    isLoading: false,
    isCompact: false,
  },
};

export const Loading: Story = {
  args: {
    patient: null,
    isLoading: true,
  },
};
