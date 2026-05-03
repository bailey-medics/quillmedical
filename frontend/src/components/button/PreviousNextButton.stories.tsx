/**
 * PreviousNextButton Storybook Stories
 *
 * Demonstrates the PreviousNextButton component for step-by-step navigation.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import PreviousNextButton from "./PreviousNextButton";

const meta: Meta<typeof PreviousNextButton> = {
  title: "Button/PreviousNextButton",
  component: PreviousNextButton,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {
    onPrevious: fn(),
    onNext: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof PreviousNextButton>;

/** Default with both buttons */
export const Default: Story = {};

/** First step — no Previous button */
export const FirstStep: Story = {
  args: {
    onPrevious: undefined,
  },
};

/** Last step with custom label */
export const LastStep: Story = {
  args: {
    nextLabel: "Submit & finish",
  },
};

/** Forward button disabled */
export const NextDisabled: Story = {
  args: {
    nextDisabled: true,
  },
};

/** Forward button loading */
export const NextLoading: Story = {
  args: {
    nextLoading: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
