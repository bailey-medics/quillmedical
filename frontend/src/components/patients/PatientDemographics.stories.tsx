import type { Meta, StoryObj } from "@storybook/react-vite";
import PatientDemographics from "./PatientDemographics";

const meta: Meta<typeof PatientDemographics> = {
  title: "PatientDemographics",
  component: PatientDemographics,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof PatientDemographics>;

const fullPatient = {
  id: "p1",
  name: "Jane Doe",
  dob: "1980-05-12",
  age: 45,
  sex: "F",
  nhsNumber: "123 456 7890",
  address: "1 High Street, Town",
  telephone: "01234 567890",
  mobile: "07123 456789",
  onQuill: true,
  nextOfKin: { name: "John Doe", phone: "07999 888777" },
};

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
