import type { Meta, StoryObj } from "@storybook/react-vite";
import PatientsList from "./PatientsList";

const meta: Meta<typeof PatientsList> = {
  title: "Patients/PatientsList",
  component: PatientsList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof PatientsList>;

const patients = [
  { id: "p1", name: "Jane Doe", dob: "1980-05-12", age: 45, onQuill: true },
  { id: "p2", name: "Alex Smith", dob: "1990-01-01", age: 35 },
  { id: "p3", name: "Sam Brown", dob: "1975-08-08", age: 50 },
];

export const Default: Story = {
  args: {
    patients,
  },
};

export const Loading: Story = {
  args: {
    patients: [],
    isLoading: true,
  },
};
