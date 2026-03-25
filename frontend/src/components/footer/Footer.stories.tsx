/**
 * Footer Component Stories
 *
 * Demonstrates the sticky footer component with text and loading states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import Footer from "./Footer";
import { Box } from "@mantine/core";

const meta: Meta<typeof Footer> = {
  title: "Footer/Footer",
  component: Footer,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <Box
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ flex: 1 }} />
        <Story />
      </Box>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Footer>;

/**
 * Default footer displaying logged-in user.
 */
export const Default: Story = {
  args: {
    text: "Logged in: mark.bailey",
  },
};

/**
 * Loading state while authentication is resolving.
 */
export const Loading: Story = {
  args: {
    loading: true,
  },
};
