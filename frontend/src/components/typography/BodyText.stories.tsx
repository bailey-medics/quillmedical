/**
 * BodyText Storybook Stories
 *
 * Demonstrates the BodyText component — standard body copy styling.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import BodyText from "./BodyText";

const meta = {
  title: "Foundations/Typography/BodyText",
  component: BodyText,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof BodyText>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleText =
  "A 65-year-old patient presents with a 3mm sessile polyp in the sigmoid colon.";

/** Default body text */
export const Default: Story = {
  args: {
    children: sampleText,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
