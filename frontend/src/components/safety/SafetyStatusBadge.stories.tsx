/**
 * SafetyStatusBadge Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import SafetyStatusBadge from "./SafetyStatusBadge";

const meta: Meta<typeof SafetyStatusBadge> = {
  title: "Safety/Safety status badge",
  component: SafetyStatusBadge,
  parameters: { layout: "padded" },
  argTypes: {
    status: {
      control: "select",
      options: ["draft", "in_review", "signed_off"],
      description: "Where the case stands",
    },
  },
};

export default meta;
type Story = StoryObj<typeof SafetyStatusBadge>;

export const Default: Story = {
  render: () => (
    <Group gap="md">
      <SafetyStatusBadge status="draft" />
      <SafetyStatusBadge status="in_review" />
      <SafetyStatusBadge status="signed_off" />
    </Group>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
