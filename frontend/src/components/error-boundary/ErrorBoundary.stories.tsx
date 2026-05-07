/**
 * ErrorBoundary Component Stories
 *
 * Demonstrates the error fallback UI that users see when an unhandled
 * React error occurs. The fallback displays a warning icon, a heading,
 * an explanation, and a reload button.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorFallback } from "./ErrorBoundary";

const meta: Meta<typeof ErrorFallback> = {
  title: "ErrorBoundary/ErrorFallback",
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
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
