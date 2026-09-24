/**
 * SendFeedbackNavLink Component Stories
 *
 * The sidebar entry that opens the feedback modal. Clicking it opens the
 * real modal; sending from a story reaches no server and shows the error.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import SendFeedbackNavLink from "./SendFeedbackNavLink";

const meta: Meta<typeof SendFeedbackNavLink> = {
  title: "Feedback/Send feedback nav link",
  component: SendFeedbackNavLink,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Stack gap={0} maw="16rem">
        <Story />
      </Stack>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SendFeedbackNavLink>;

/** With the icon, as both sidebars show it */
export const Default: Story = {};

/** Without the icon */
export const WithoutIcon: Story = {
  args: { showIcons: false },
};

/** On the sender's own feedback page, where a child appears beneath it */
export const OnYourFeedbackPage: Story = {
  parameters: { routerPath: "/feedback" },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
