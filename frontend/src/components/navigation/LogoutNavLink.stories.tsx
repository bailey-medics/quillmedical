/**
 * LogoutNavLink Component Stories
 *
 * The sidebar entry that signs somebody out. In a story nothing is
 * signed out: the link is handed a function that succeeds or fails.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { expect, userEvent, within } from "storybook/test";
import LogoutNavLink from "./LogoutNavLink";

const meta: Meta<typeof LogoutNavLink> = {
  title: "Navigation/Logout nav link",
  component: LogoutNavLink,
  parameters: { layout: "padded" },
  args: {
    onLogout: () => Promise.resolve(),
    onNavigate: undefined,
  },
  decorators: [
    (Story) => (
      <Stack gap={0} maw="16rem">
        <Story />
      </Stack>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LogoutNavLink>;

/** With the icon, as both sidebars show it */
export const Default: Story = {};

/** Without the icon */
export const WithoutIcon: Story = { args: { showIcons: false } };

/** Signing out could not be done, and the link says so */
export const Failed: Story = {
  args: { onLogout: () => Promise.reject(new Error("offline")) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByText("Logout"));

    await expect(
      await canvas.findAllByText(/could not sign you out/i),
    ).not.toHaveLength(0);
  },
};
