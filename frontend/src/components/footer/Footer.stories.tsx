/**
 * Footer Component Stories
 *
 * Demonstrates the sticky footer component:
 * - Displays text at bottom of viewport
 * - Sticky positioning
 * - Hidden when no text provided
 * - Minimal, unobtrusive design
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import Footer from "./Footer";
import { Box, Text } from "@mantine/core";

const meta: Meta<typeof Footer> = {
  title: "Footer/Footer",
  component: Footer,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Footer>;

/**
 * Default: With User Email
 *
 * Footer displays the provided text. Sticky positioning keeps it visible
 * at the bottom.
 */
export const Default: Story = {
  args: {
    text: "Logged in: mark.bailey",
    size: "lg",
  },
  decorators: [
    (Story) => (
      <Box
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ flex: 1 }} p="md">
          <Text size="xl" fw={700} mb="md">
            Main Content Area
          </Text>
          <Text mb="md">
            Footer sticks to the bottom of the viewport even with minimal
            content.
          </Text>
          {Array.from({ length: 5 }, (_, i) => (
            <Text key={i} mb="sm">
              Content line {i + 1}: Lorem ipsum dolor sit amet, consectetur
              adipiscing elit.
            </Text>
          ))}
        </Box>
        <Story />
      </Box>
    ),
  ],
};

/**
 * With Long Content
 *
 * Demonstrates footer behavior with scrollable content.
 * Footer remains visible at the bottom of the viewport.
 */
export const WithLongContent: Story = {
  args: {
    text: "Logged in: jane.doe",
    size: "lg",
  },
  decorators: [
    (Story) => (
      <Box
        style={{ minHeight: "200vh", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ flex: 1 }} p="md">
          <Text size="xl" fw={700} mb="md">
            Very Long Content
          </Text>
          <Text mb="md">
            Scroll down to see the footer remains at the bottom of the viewport.
          </Text>
          {Array.from({ length: 50 }, (_, i) => (
            <Text key={i} mb="sm">
              Content line {i + 1}: Lorem ipsum dolor sit amet, consectetur
              adipiscing elit. Sed do eiusmod tempor incididunt ut labore et
              dolore magna aliqua.
            </Text>
          ))}
        </Box>
        <Story />
      </Box>
    ),
  ],
};

/**
 * Loading State
 *
 * Footer displays a loading indicator while authentication state is loading.
 */
export const Loading: Story = {
  args: {
    loading: true,
    size: "lg",
  },
  decorators: [
    (Story) => (
      <Box
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ flex: 1 }} p="md">
          <Text size="xl" fw={700} mb="md">
            Loading State
          </Text>
          <Text mb="md">
            Footer shows a loading indicator while determining user
            authentication.
          </Text>
        </Box>
        <Story />
      </Box>
    ),
  ],
};

/**
 * Hidden: No Text
 *
 * Footer is hidden when no text is provided.
 */
export const Hidden: Story = {
  args: {
    text: undefined,
  },
  decorators: [
    (Story) => (
      <Box
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ flex: 1 }} p="md">
          <Text size="xl" fw={700} mb="md">
            No Footer
          </Text>
          <Text mb="md">Footer is hidden when no text is provided.</Text>
        </Box>
        <Story />
      </Box>
    ),
  ],
};

/**
 * Size: Small
 *
 * Footer with small text size (14px).
 */
export const SizeSmall: Story = {
  args: {
    text: "Logged in: user.name",
    size: "sm",
  },
  decorators: [
    (Story) => (
      <Box
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ flex: 1 }} p="md">
          <Text size="xl" fw={700} mb="md">
            Small Size Footer
          </Text>
          <Text mb="md">Footer with small text size (14px).</Text>
        </Box>
        <Story />
      </Box>
    ),
  ],
};

/**
 * Size: Medium
 *
 * Footer with medium text size (16px) - used on mobile.
 */
export const SizeMedium: Story = {
  args: {
    text: "Logged in: user.name",
    size: "md",
  },
  decorators: [
    (Story) => (
      <Box
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ flex: 1 }} p="md">
          <Text size="xl" fw={700} mb="md">
            Medium Size Footer
          </Text>
          <Text mb="md">
            Footer with medium text size (16px) - used on mobile/small screens.
          </Text>
        </Box>
        <Story />
      </Box>
    ),
  ],
};

/**
 * Size: Large
 *
 * Footer with large text size (20px) - default desktop size.
 */
export const SizeLarge: Story = {
  args: {
    text: "Logged in: user.name",
    size: "lg",
  },
  decorators: [
    (Story) => (
      <Box
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <Box style={{ flex: 1 }} p="md">
          <Text size="xl" fw={700} mb="md">
            Large Size Footer
          </Text>
          <Text mb="md">
            Footer with large text size (20px) - default for desktop.
          </Text>
        </Box>
        <Story />
      </Box>
    ),
  ],
};
