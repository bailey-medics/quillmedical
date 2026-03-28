import type { Meta, StoryObj } from "@storybook/react-vite";
import PageHeader from "./PageHeader";
import BodyText from "./BodyText";
import { Box, Stack } from "@mantine/core";

const meta = {
  title: "Typography/PageHeader",
  component: PageHeader,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Box maw={800}>
        <Stack gap="sm">
          <Story />
          <BodyText>
            This is body text underneath the page header to show relative
            sizing.
          </BodyText>
        </Stack>
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
