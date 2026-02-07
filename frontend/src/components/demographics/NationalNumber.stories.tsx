/**
 * NationalNumber Component Stories
 *
 * Demonstrates the NHS number display component:
 * - Formatted NHS number (XXX-XXX-XXXX pattern)
 * - Copy to clipboard functionality
 * - Validation indicator (valid/invalid checksum)
 * - Accessible labels and tooltips
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import NationalNumber from "./NationalNumber";

const meta = {
  title: "Data/NationalNumber",
  component: NationalNumber,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof NationalNumber>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NHSNumber: Story = {
  args: {
    nationalNumber: "1234567890",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
  },
};

/**
 * Medicare number - displays as-is without NHS prefix
 */
export const MedicareNumber: Story = {
  args: {
    nationalNumber: "2950156481",
    nationalNumberSystem:
      "http://ns.electronichealth.net.au/id/medicare-number",
  },
};
