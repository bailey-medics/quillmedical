/**
 * SpecialtyField Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import SpecialtyField from "./SpecialtyField";

const meta: Meta<typeof SpecialtyField> = {
  title: "Passport/Specialty field",
  component: SpecialtyField,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SpecialtyField>;

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
    return <SpecialtyField value={value} onChange={setValue} required />;
  },
};
