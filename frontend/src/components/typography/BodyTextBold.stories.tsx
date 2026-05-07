/**
 * BodyTextBold Storybook Stories
 *
 * Demonstrates the BodyTextBold component — bold body copy styling with black text.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import BodyTextBold from "./BodyTextBold";

const meta = {
  title: "Foundations/Typography/BodyTextBold",
  component: BodyTextBold,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof BodyTextBold>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleText =
  "A 65-year-old patient presents with a 3mm sessile polyp in the sigmoid colon.";

/** Default bold body text */
export const Default: Story = {
  args: {
    children: sampleText,
  },
};

/** Centre-justified text */
export const Centre: Story = {
  args: {
    children: sampleText,
    justify: "centre",
  },
};

/** Right-justified text */
export const Right: Story = {
  args: {
    children: sampleText,
    justify: "right",
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
