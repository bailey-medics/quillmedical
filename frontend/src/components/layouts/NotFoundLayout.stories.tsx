import type { Meta, StoryObj } from "@storybook/react-vite";
import NotFoundLayout from "./NotFoundLayout";

const meta: Meta<typeof NotFoundLayout> = {
  title: "Layouts/NotFoundLayout",
  component: NotFoundLayout,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof NotFoundLayout>;

/**
 * Default 404 error page
 * Displays when user navigates to non-existent route
 */
export const Default: Story = {};
