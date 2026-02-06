import type { Meta, StoryObj } from "@storybook/react-vite";
import PatientsList from "./PatientsList";

const meta: Meta<typeof PatientsList> = {
  title: "PatientsList",
  component: PatientsList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof PatientsList>;

const patients = [
  {
    id: "p1",
    name: "Jane Doe",
    dob: "1980-05-12",
    age: 45,
    sex: "female",
    nhsNumber: "123456789",
    onQuill: true,
    colorFrom: "#667eea",
    colorTo: "#764ba2",
  },
  {
    id: "p2",
    name: "Alex Smith",
    dob: "1990-01-01",
    age: 35,
    sex: "male",
    nhsNumber: "987654321",
    colorFrom: "#4ECDC4",
    colorTo: "#44A08D",
  },
  {
    id: "p3",
    name: "Sam Brown",
    dob: "1975-08-08",
    age: 50,
    sex: "male",
    nhsNumber: "555555555",
    colorFrom: "#FF6B6B",
    colorTo: "#FFE66D",
  },
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
