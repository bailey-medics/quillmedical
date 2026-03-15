/**
 * ButtonPair Storybook Stories
 *
 * Demonstrates the ButtonPair component for accept/cancel actions.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import ButtonPair from "./ButtonPair";

const meta: Meta<typeof ButtonPair> = {
  title: "Button/ButtonPair",
  component: ButtonPair,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {
    onAccept: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ButtonPair>;

/** Default button pair */
export const Default: Story = {};

/** Custom labels */
export const CustomLabels: Story = {
  args: {
    acceptLabel: "Save changes",
    cancelLabel: "Discard",
  },
};

/** Accept button disabled */
export const AcceptDisabled: Story = {
  args: {
    acceptDisabled: true,
  },
};
