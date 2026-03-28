/**
 * ResultMessage Component Stories
 *
 * Demonstrates result alert banners mirroring the StateMessage pattern:
 * - Success: green with check icon
 * - Error: red with X icon
 * - With and without subtitle
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import ResultMessage from "./ResultMessage";

const meta: Meta<typeof ResultMessage> = {
  title: "MessageCards/ResultMessage",
  component: ResultMessage,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof ResultMessage>;

/**
 * Success
 *
 * Green alert with check icon for positive outcomes.
 */
export const Success: Story = {
  args: {
    variant: "success",
    title: "Passed",
    subtitle: "Optical diagnosis of diminutive colorectal polyps",
  },
};

/**
 * Error
 *
 * Red alert with X icon for negative outcomes.
 */
export const Error: Story = {
  args: {
    variant: "error",
    title: "Not passed",
    subtitle: "Optical diagnosis of diminutive colorectal polyps",
  },
};

/**
 * Without subtitle
 *
 * Alert with title only, no subtitle.
 */
export const WithoutSubtitle: Story = {
  args: {
    variant: "success",
    title: "Operation completed successfully",
  },
};
