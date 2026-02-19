/**
 * Icon Component Stories
 *
 * Demonstrates the Icon component with different sizes and icon types.
 * Shows the standard sizing conventions used throughout the application.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Group, Text, Card } from "@mantine/core";
import {
  IconPencil,
  IconUserPlus,
  IconSettings,
  IconMail,
  IconCalendar,
  IconFileText,
  IconChartBar,
  IconSearch,
} from "@tabler/icons-react";
import Icon from "./Icon";

/**
 * Icon component provides consistent sizing for Tabler icons.
 *
 * **Size Variants (Desktop ≥768px):**
 * - `sm` (20px): Inputs, small buttons, inline text
 * - `md` (28px): Default size, general UI elements
 * - `lg` (48px): Action cards, prominent features
 *
 * **Size Variants (Mobile <768px):**
 * - `sm` (16px): Inputs, small buttons, inline text
 * - `md` (20px): Default size, general UI elements
 * - `lg` (32px): Action cards, prominent features
 *
 * Icons automatically scale down on mobile for better touch targets and visual balance.
 */
const meta = {
  title: "Icons/Icon",
  component: Icon,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default Icon with medium size (28px desktop, 20px mobile)
 */
export const Default: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
  },
};

/**
 * Small Icon (20px desktop, 16px mobile)
 *
 * Used in inputs, small buttons, and inline with text
 */
export const Small: Story = {
  args: {
    icon: <IconPencil />,
    size: "sm",
  },
};

/**
 * Medium Icon (28px desktop, 20px mobile)
 *
 * Default size for general UI elements
 */
export const Medium: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
  },
};

/**
 * Large Icon (48px desktop, 32px mobile)
 *
 * Used in action cards and prominent features
 */
export const Large: Story = {
  args: {
    icon: <IconPencil />,
    size: "lg",
  },
};

/**
 * All Sizes Comparison
 *
 * Side-by-side comparison of all three size variants
 */
export const AllSizes: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
  },
  render: () => (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="xl">
        <div>
          <Text size="sm" fw={700} mb="xs">
            Small (20px desktop, 16px mobile)
          </Text>
          <Group gap="md">
            <Icon icon={<IconPencil />} size="sm" />
            <Icon icon={<IconUserPlus />} size="sm" />
            <Icon icon={<IconSettings />} size="sm" />
            <Icon icon={<IconMail />} size="sm" />
            <Icon icon={<IconSearch />} size="sm" />
          </Group>
        </div>

        <div>
          <Text size="sm" fw={700} mb="xs">
            Medium (28px desktop, 20px mobile) - Default
          </Text>
          <Group gap="md">
            <Icon icon={<IconPencil />} size="md" />
            <Icon icon={<IconUserPlus />} size="md" />
            <Icon icon={<IconSettings />} size="md" />
            <Icon icon={<IconMail />} size="md" />
            <Icon icon={<IconSearch />} size="md" />
          </Group>
        </div>

        <div>
          <Text size="sm" fw={700} mb="xs">
            Large (48px desktop, 32px mobile)
          </Text>
          <Group gap="md">
            <Icon icon={<IconPencil />} size="lg" />
            <Icon icon={<IconUserPlus />} size="lg" />
            <Icon icon={<IconSettings />} size="lg" />
            <Icon icon={<IconMail />} size="lg" />
            <Icon icon={<IconSearch />} size="lg" />
          </Group>
        </div>
      </Stack>
    </Card>
  ),
};

/**
 * Various Icon Types
 *
 * Shows the Icon component works with any Tabler icon
 */
export const VariousIcons: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
  },
  render: () => (
    <Group gap="md">
      <Icon icon={<IconPencil />} />
      <Icon icon={<IconUserPlus />} />
      <Icon icon={<IconSettings />} />
      <Icon icon={<IconMail />} />
      <Icon icon={<IconCalendar />} />
      <Icon icon={<IconFileText />} />
      <Icon icon={<IconChartBar />} />
      <Icon icon={<IconSearch />} />
    </Group>
  ),
};

/**
 * With Custom Styling
 *
 * Demonstrates applying custom className for additional styling
 */
export const WithCustomClass: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
  },
  render: () => (
    <Group gap="md">
      <Icon icon={<IconPencil />} size="lg" className="custom-icon" />
      <style>{`
        .custom-icon {
          color: var(--mantine-color-blue-6);
        }
      `}</style>
    </Group>
  ),
};
