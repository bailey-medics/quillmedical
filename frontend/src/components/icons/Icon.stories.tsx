/**
 * Icon Component Stories
 *
 * Demonstrates the Icon component with all available icons used in the
 * application, displayed in a 5-column grid with labels.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { SimpleGrid, Stack, Text, Card } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import Icon from "./Icon";
import appIcons from "./appIcons";

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
 * All available icons used in the application, displayed in a 5-column grid.
 */
export const Default: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
  },
  render: () => (
    <SimpleGrid cols={5} spacing="lg" style={{ maxWidth: 700 }}>
      {appIcons.map(({ name, icon }) => (
        <Card
          key={name}
          shadow="xs"
          padding="md"
          radius="md"
          withBorder
          style={{ textAlign: "center" }}
        >
          <Stack gap="xs" align="center">
            <Icon icon={icon} size="lg" />
            <Text size="xs" c="dimmed">
              {name}
            </Text>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  ),
};

/**
 * All sizes comparison — sm, md, and lg side by side.
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
          <SimpleGrid cols={5} spacing="md">
            {appIcons.slice(0, 10).map(({ name, icon }) => (
              <Stack key={name} gap={4} align="center">
                <Icon icon={icon} size="sm" />
                <Text size="xs" c="dimmed">
                  {name}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </div>

        <div>
          <Text size="sm" fw={700} mb="xs">
            Medium (28px desktop, 20px mobile) — default
          </Text>
          <SimpleGrid cols={5} spacing="md">
            {appIcons.slice(0, 10).map(({ name, icon }) => (
              <Stack key={name} gap={4} align="center">
                <Icon icon={icon} size="md" />
                <Text size="xs" c="dimmed">
                  {name}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </div>

        <div>
          <Text size="sm" fw={700} mb="xs">
            Large (48px desktop, 32px mobile)
          </Text>
          <SimpleGrid cols={5} spacing="md">
            {appIcons.slice(0, 10).map(({ name, icon }) => (
              <Stack key={name} gap={4} align="center">
                <Icon icon={icon} size="lg" />
                <Text size="xs" c="dimmed">
                  {name}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </div>
      </Stack>
    </Card>
  ),
};
