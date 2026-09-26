/**
 * CompetencyPicker Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import CompetencyPicker from "./CompetencyPicker";

const meta: Meta<typeof CompetencyPicker> = {
  title: "Passport/Competency picker",
  component: CompetencyPicker,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CompetencyPicker>;

export const Default: Story = {
  args: {
    value: null,
    onChange: fn(),
  },
};

export const WithDescription: Story = {
  args: {
    value: null,
    onChange: fn(),
    description: "What you are asking to be signed off for.",
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    value: "perform_cannulation",
    onChange: fn(),
    disabled: true,
  },
};
