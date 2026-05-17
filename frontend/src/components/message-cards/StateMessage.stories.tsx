/**
 * StateMessage Component Stories
 *
 * Demonstrates informational alert messages for different application states.
 * All content is passed via props — icon, title, description, and colour.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import { Stack } from "@mantine/core";
import StateMessage from "./StateMessage";
import { IconClock } from "@/components/icons/appIcons";

const meta: Meta<typeof StateMessage> = {
  title: "Message cards/State message",
  component: StateMessage,
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof StateMessage>;

export const Default: Story = {
  args: {
    icon: <IconClock />,
    title: "Database is initialising",
    description:
      "The Quill databases are just warming up. This may take a few moments. The patient list will appear automatically once available.",
    colour: "info",
  },
  decorators: [
    (Story) => (
      <Stack gap="md">
        <StoryNote>Props include a status colour, icon and message</StoryNote>
        <Story />
      </Stack>
    ),
  ],
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
