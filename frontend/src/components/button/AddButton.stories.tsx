/**
 * AddButton Storybook Stories
 *
 * Demonstrates the AddButton component with different labels and states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Container, Text } from "@mantine/core";
import { fn } from "@storybook/test";
import AddButton from "./AddButton";

const meta: Meta<typeof AddButton> = {
  title: "Components/Button/AddButton",
  component: AddButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AddButton>;

/**
 * Default AddButton
 *
 * Shows the default add button with "Add user" label at large size.
 */
export const Default: Story = {
  args: {
    label: "Add user",
  },
};

/**
 * Common Labels
 *
 * Displays common "Add" button variations used throughout the application.
 */
export const CommonLabels: Story = {
  render: () => (
    <Container size="lg">
      <Stack gap="lg">
        <div>
          <Text size="sm" fw={500} mb="xs">
            Add User
          </Text>
          <AddButton label="Add user" />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Add Patient
          </Text>
          <AddButton label="Add patient" />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Add Record
          </Text>
          <AddButton label="Add record" />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Add Permission
          </Text>
          <AddButton label="Add permission" />
        </div>
      </Stack>
    </Container>
  ),
};

/**
 * Button States
 *
 * Shows the button in different states: normal, loading, and disabled.
 */
export const States: Story = {
  render: () => (
    <Container size="lg">
      <Stack gap="lg">
        <div>
          <Text size="sm" fw={500} mb="xs">
            Normal
          </Text>
          <AddButton label="Add user" />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Loading
          </Text>
          <AddButton label="Add user" loading />
        </div>
        <div>
          <Text size="sm" fw={500} mb="xs">
            Disabled
          </Text>
          <AddButton label="Add user" disabled />
        </div>
      </Stack>
    </Container>
  ),
};

/**
 * Interactive Example
 *
 * Demonstrates the button with an interactive click handler.
 */
export const Interactive: Story = {
  args: {
    label: "Add user",
  },
  render: (args) => <AddButton {...args} />,
};
