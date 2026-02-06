import type { Meta, StoryObj } from "@storybook/react-vite";
import Demographics from "./Demographics";
import type { Patient } from "@/domains/patient";

const meta = {
  title: "Demographics",
  component: Demographics,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Demographics>;

export default meta;
type Story = StoryObj<typeof meta>;

const basePatient: Patient = {
  id: "1",
  name: "John Smith",
  dob: "1985-03-15",
  age: 38,
  sex: "Male",
  nationalNumber: "1234567890",
  nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
};

export const Default: Story = {
  args: {
    patient: basePatient,
  },
};

export const WithAllDetails: Story = {
  args: {
    patient: {
      ...basePatient,
      name: "Sarah Elizabeth Johnson",
      dob: "1992-07-22",
      age: 31,
      sex: "Female",
      nationalNumber: "9876543210",
      nationalNumberSystem:
        "http://ns.electronichealth.net.au/id/medicare-number",
    },
  },
};

export const MinimalDetails: Story = {
  args: {
    patient: {
      id: "2",
      name: "Jane Doe",
    },
  },
};

export const WithoutAge: Story = {
  args: {
    patient: {
      id: "3",
      name: "Michael Brown",
      dob: "1978-11-30",
      sex: "Male",
      nationalNumber: "5555555555",
      nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    },
  },
};

export const WithoutNationalNumber: Story = {
  args: {
    patient: {
      id: "4",
      name: "Emily Davis",
      dob: "2000-01-01",
      age: 26,
      sex: "Female",
    },
  },
};

export const LongName: Story = {
  args: {
    patient: {
      id: "5",
      name: "Alexander Christopher Montgomery-Wellington III",
      dob: "1965-12-25",
      age: 60,
      sex: "Male",
      nationalNumber: "1111222233",
      nationalNumberSystem: "http://example.org/national-health-id",
    },
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};
