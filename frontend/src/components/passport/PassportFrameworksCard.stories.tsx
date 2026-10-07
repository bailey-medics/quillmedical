/**
 * PassportFrameworksCard Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import PassportFrameworksCard from "./PassportFrameworksCard";
import { FRAMEWORK_OPTIONS } from "@lib/passport/frameworks";

const meta: Meta<typeof PassportFrameworksCard> = {
  title: "Passport/Passport frameworks card",
  component: PassportFrameworksCard,
  parameters: { layout: "padded" },
  args: { options: FRAMEWORK_OPTIONS, onChange: fn() },
};

export default meta;
type Story = StoryObj<typeof PassportFrameworksCard>;

export const Default: Story = {
  args: { value: ["clinical"] },
};

/** A passport made before frameworks existed, or one with none chosen. */
export const NoneChosen: Story = {
  args: { value: [] },
};

/** After an entitlement ends: shown, and not changeable. */
export const ReadOnly: Story = {
  args: { value: ["clinical"], disabled: true },
};

export const SaveFailed: Story = {
  args: {
    value: ["clinical"],
    error: "Your frameworks could not be saved. Please try again.",
  },
};
