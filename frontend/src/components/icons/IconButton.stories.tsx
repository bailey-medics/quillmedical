/**
 * IconButton Component Stories
 *
 * Storybook stories for the IconButton component.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Group, Text } from "@mantine/core";
import IconButton from "./IconButton";
import {
  IconPencil,
  IconTrash,
  IconCheck,
  IconX,
  IconSettings,
  IconPlus,
} from "@tabler/icons-react";

const meta = {
  title: "Icons/IconButton",
  component: IconButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default IconButton with medium size.
 * Container: 44px, Icon: 28px (desktop), 20px (mobile <768px)
 */
export const Default: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Edit",
  },
};

/**
 * Small size IconButton.
 * Container: 36px, Icon: 20px (desktop), 16px (mobile <768px)
 */
export const Small: Story = {
  args: {
    icon: <IconPencil />,
    size: "sm",
    "aria-label": "Edit small",
  },
};

/**
 * Medium size IconButton (default).
 * Container: 44px, Icon: 28px (desktop), 20px (mobile <768px)
 */
export const Medium: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
    "aria-label": "Edit medium",
  },
};

/**
 * Large size IconButton.
 * Container: 60px, Icon: 48px (desktop), 32px (mobile <768px)
 */
export const Large: Story = {
  args: {
    icon: <IconPencil />,
    size: "lg",
    "aria-label": "Edit large",
  },
};

/**
 * All three sizes shown side-by-side for comparison.
 * Resize browser below 768px to see mobile sizes.
 */
export const AllSizes: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
    "aria-label": "Example",
  },
  render: () => (
    <Group gap="xl" align="center">
      <Stack align="center" gap="xs">
        <IconButton icon={<IconPencil />} size="sm" aria-label="Small" />
        <Text size="xs" c="dimmed">
          Small (36px)
        </Text>
      </Stack>
      <Stack align="center" gap="xs">
        <IconButton icon={<IconPencil />} size="md" aria-label="Medium" />
        <Text size="xs" c="dimmed">
          Medium (44px)
        </Text>
      </Stack>
      <Stack align="center" gap="xs">
        <IconButton icon={<IconPencil />} size="lg" aria-label="Large" />
        <Text size="xs" c="dimmed">
          Large (60px)
        </Text>
      </Stack>
    </Group>
  ),
};

/**
 * Various icon types with different variants and colors.
 */
export const Variants: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Example",
  },
  render: () => (
    <Stack gap="lg">
      <Group gap="md">
        <IconButton
          icon={<IconPencil />}
          variant="subtle"
          color="blue"
          aria-label="Edit"
        />
        <IconButton
          icon={<IconTrash />}
          variant="light"
          color="red"
          aria-label="Delete"
        />
        <IconButton
          icon={<IconCheck />}
          variant="filled"
          color="green"
          aria-label="Confirm"
        />
        <IconButton
          icon={<IconX />}
          variant="outline"
          color="gray"
          aria-label="Cancel"
        />
      </Group>
      <Group gap="md">
        <IconButton
          icon={<IconSettings />}
          variant="default"
          aria-label="Settings"
        />
        <IconButton
          icon={<IconPlus />}
          variant="transparent"
          aria-label="Add"
        />
      </Group>
    </Stack>
  ),
};

/**
 * IconButton with disabled state.
 */
export const Disabled: Story = {
  args: {
    icon: <IconPencil />,
    disabled: true,
    "aria-label": "Disabled edit",
  },
};

/**
 * IconButton with loading state.
 */
export const Loading: Story = {
  args: {
    icon: <IconPencil />,
    loading: true,
    "aria-label": "Loading",
  },
};

/**
 * Interactive IconButton with click handler.
 * Click the button to see the action in the Actions panel.
 */
export const Interactive: Story = {
  args: {
    icon: <IconPencil />,
    variant: "subtle",
    color: "blue",
    onClick: () => alert("IconButton clicked!"),
    "aria-label": "Edit (click me)",
  },
};

/**
 * IconButton with custom styling.
 */
export const WithCustomClass: Story = {
  args: {
    icon: <IconPencil />,
    className: "custom-icon-button",
    "aria-label": "Custom styled",
  },
};
