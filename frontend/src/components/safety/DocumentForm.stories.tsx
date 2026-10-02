/**
 * DocumentForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import DocumentForm from "./DocumentForm";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof DocumentForm> = {
  title: "Safety/Document form",
  component: DocumentForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DocumentForm>;

export const Default: Story = {
  args: {
    initial: SAFETY_CASES[0].documents[0].content,
    onSave: fn(),
    onCancel: fn(),
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
