/**
 * SearchButton Stories
 *
 * Demonstrates the search toggle button on a navy background,
 * matching its appearance on the top ribbon.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import SearchButton from "./SearchButton";

const meta: Meta<typeof SearchButton> = {
  title: "Button/SearchButton",
  component: SearchButton,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Box bg="primary.9" p="xl" w="fit-content">
        <Story />
      </Box>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SearchButton>;

/** Default state — white magnifying glass on navy background. */
export const Default: Story = {
  args: {
    onClick: () => {},
  },
};
