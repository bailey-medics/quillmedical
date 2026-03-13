/**
 * Demographics Component Stories
 *
 * Demonstrates the compact patient demographics summary:
 * - Patient name and age
 * - Gender icon and label
 * - Date of birth formatting
 * - NHS number display
 * - Used in patient cards and summaries
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import Demographics from "./Demographics";
import type { Patient } from "@/domains/patient";

const meta = {
  title: "Demographics/Demographics",
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
  givenName: "John",
  familyName: "Smith",
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
