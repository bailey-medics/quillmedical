import type { Meta, StoryObj } from "@storybook/react-vite";
import PageHeader from "./PageHeader";
import { Box } from "@mantine/core";

const meta = {
  title: "Typography/PageHeader",
  component: PageHeader,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Box maw={800}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Administration",
  },
};
