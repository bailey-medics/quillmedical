/**
 * DocumentTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import DocumentTable from "./DocumentTable";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof DocumentTable> = {
  title: "Safety/Document table",
  component: DocumentTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DocumentTable>;

export const Default: Story = {
  args: { documents: SAFETY_CASES[0].documents, onSelect: fn() },
};

export const Empty: Story = {
  args: { documents: [] },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
