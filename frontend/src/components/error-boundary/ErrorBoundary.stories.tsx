/**
 * ErrorBoundary Component Stories
 *
 * Demonstrates the error fallback UI that users see when an unhandled
 * React error occurs. The fallback displays a warning icon, a heading,
 * an explanation, a reload button, and a way to tell us what happened.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorFallback } from "./ErrorBoundary";

const meta: Meta<typeof ErrorFallback> = {
  title: "Error boundary/Error fallback",
  component: ErrorFallback,
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof ErrorFallback>;

export const Default: Story = {
  args: {
    onReload: () => {},
    error: { name: "TypeError", code: "BANK_NOT_FOUND" },
    // Set explicitly: `argTypesRegex` would otherwise inject a spy that
    // resolves at once, and the story would send nowhere real either way.
    onSendFeedback: async () => {},
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
