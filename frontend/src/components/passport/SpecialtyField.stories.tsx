/**
 * SpecialtyField Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { PASSPORT_SPECIALTIES } from "@lib/passport/specialties";
import SpecialtyField from "./SpecialtyField";

const meta: Meta<typeof SpecialtyField> = {
  title: "Passport/Specialty field",
  component: SpecialtyField,
  parameters: { layout: "padded" },
  // The alphabetical default, which every story starts from
  args: { options: PASSPORT_SPECIALTIES },
};

export default meta;
type Story = StoryObj<typeof SpecialtyField>;

/**
 * An organisation's lead specialty first: an oncology department puts
 * Oncology at the top, and the rest follow alphabetically.
 */
export const OrganisationLeadFirst: Story = {
  args: {
    options: [
      { id: "oncology", display_name: "Oncology" },
      { id: "general_medicine", display_name: "General medicine" },
      { id: "general_surgery", display_name: "General surgery" },
    ],
    value: null,
    onChange: fn(),
  },
};

/** Not yet answered: nothing is preselected. */
export const Unanswered: Story = {
  args: {
    value: null,
    onChange: fn(),
    required: true,
  },
};

export const Oncology: Story = {
  args: {
    value: ["oncology"],
    onChange: fn(),
  },
};

export const TwoSpecialties: Story = {
  args: {
    value: ["general_medicine", "oncology"],
    onChange: fn(),
  },
};

/** Generic: no specialty order. */
export const Generic: Story = {
  args: {
    value: [],
    onChange: fn(),
  },
};

export const WithError: Story = {
  args: {
    value: null,
    onChange: fn(),
    error: "Choose a specialty, or Generic",
  },
};

export const Disabled: Story = {
  args: {
    value: ["oncology"],
    onChange: fn(),
    disabled: true,
  },
};

/**
 * Try it: choosing Generic clears any specialty, and choosing a
 * specialty clears Generic.
 */
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<string[] | null>(null);
    return (
      <SpecialtyField
        options={PASSPORT_SPECIALTIES}
        value={value}
        onChange={setValue}
        required
      />
    );
  },
};
