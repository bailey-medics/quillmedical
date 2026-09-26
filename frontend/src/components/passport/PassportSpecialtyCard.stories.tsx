/**
 * PassportSpecialtyCard Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import PassportSpecialtyCard from "./PassportSpecialtyCard";

const meta: Meta<typeof PassportSpecialtyCard> = {
  title: "Passport/Passport specialty card",
  component: PassportSpecialtyCard,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PassportSpecialtyCard>;

export const Oncology: Story = {
  args: { value: ["oncology"], onChange: fn() },
};

export const Generic: Story = {
  args: { value: [], onChange: fn() },
};

/** After an entitlement ends the passport is read-only. */
export const ReadOnly: Story = {
  args: { value: ["general_surgery"], onChange: fn(), disabled: true },
};

export const SaveFailed: Story = {
  args: {
    value: ["oncology"],
    onChange: fn(),
    error: "Your specialty could not be saved. Please try again.",
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<string[]>(["oncology"]);
    return <PassportSpecialtyCard value={value} onChange={setValue} />;
  },
};
