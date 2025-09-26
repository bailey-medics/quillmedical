import { demoPatientFull as fullPatient } from "@/demo-data/patients/demoPatients";
import type { Meta, StoryObj } from "@storybook/react-vite";
import PatientDemographics from "./PatientDemographics";

const meta: Meta<typeof PatientDemographics> = {
  title: "PatientDemographics",
  component: PatientDemographics,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof PatientDemographics>;

// use demo patient from centralized demo-data

export const Default: Story = {
  args: {
    patient: fullPatient,
    isLoading: false,
    isCompact: false,
  },
};

export const Minimal: Story = {
  args: {
    patient: { id: "p2", name: "Alex Smith" },
  },
};

export const Loading: Story = {
  args: {
    patient: null,
    isLoading: true,
  },
};
