/**
 * PlaceholderTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import PlaceholderTable from "./PlaceholderTable";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof PlaceholderTable> = {
  title: "Safety/Placeholder table",
  component: PlaceholderTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PlaceholderTable>;

export const Default: Story = {
  args: { placeholders: SAFETY_CASES[0].placeholders },
};

export const Empty: Story = {
  args: { placeholders: [] },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
