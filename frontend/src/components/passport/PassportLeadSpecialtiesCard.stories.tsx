/**
 * PassportLeadSpecialtiesCard Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { PASSPORT_SPECIALTIES } from "@lib/passport/specialties";
import PassportLeadSpecialtiesCard from "./PassportLeadSpecialtiesCard";

const meta: Meta<typeof PassportLeadSpecialtiesCard> = {
  title: "Passport/Passport lead specialties card",
  component: PassportLeadSpecialtiesCard,
  parameters: { layout: "padded" },
  args: { options: PASSPORT_SPECIALTIES, onChange: fn() },
};

export default meta;
type Story = StoryObj<typeof PassportLeadSpecialtiesCard>;

/** None set: everybody here sees the plain alphabetical list. */
export const NoneSet: Story = {
  args: { value: [] },
};

/** An oncology department: Oncology first. */
export const OncologyFirst: Story = {
  args: { value: ["oncology"] },
};

/** Two leads, in the order they were picked. */
export const TwoLeads: Story = {
  args: { value: ["general_surgery", "oncology"] },
};

/** A saved lead whose specialty file has since been removed. */
export const NoLongerOffered: Story = {
  args: { value: ["cardiology", "oncology"] },
};

/** The saved list is still loading. */
export const Loading: Story = {
  args: { value: [], disabled: true },
};

/** The last change could not be saved. */
export const SaveFailed: Story = {
  args: {
    value: ["oncology"],
    error: "The lead specialties could not be saved. Please try again.",
  },
};

/** Pick and remove leads; the order picked is the order they lead. */
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<string[]>(["oncology"]);
    return (
      <PassportLeadSpecialtiesCard
        options={PASSPORT_SPECIALTIES}
        value={value}
        onChange={setValue}
      />
    );
  },
};
