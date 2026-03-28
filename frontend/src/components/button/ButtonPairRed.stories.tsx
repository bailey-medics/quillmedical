/**
 * ButtonPairRed Storybook Stories
 *
 * Demonstrates the ButtonPairRed component for destructive accept/cancel actions.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import ButtonPairRed from "./ButtonPairRed";

const meta: Meta<typeof ButtonPairRed> = {
  title: "Button/ButtonPairRed",
  component: ButtonPairRed,
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
type Story = StoryObj<typeof ButtonPairRed>;

/** Default red button pair */
export const Default: Story = {};

/** Custom labels for navigation warning */
export const NavigationWarning: Story = {
  args: {
    acceptLabel: "Leave page",
    cancelLabel: "Stay on page",
  },
};

/** Accept button disabled */
export const AcceptDisabled: Story = {
  args: {
    acceptDisabled: true,
  },
};
