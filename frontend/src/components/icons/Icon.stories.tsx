/**
 * Icon Component Stories
 *
 * Demonstrates the Icon component with all available icons used in the
 * application, displayed in a 5-column grid with labels.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconPencil, IconCheck, IconX } from "@/components/icons/appIcons";
import Icon from "./Icon";
import { iconCatalogue } from "./appIcons";
import BaseCard from "@/components/base-card/BaseCard";

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
      {Object.entries(iconCatalogue).map(([name, IconComponent]) => (
        <BaseCard key={name} style={{ textAlign: "center" }}>
          <Stack gap="xs" align="center">
            <Icon icon={<IconComponent />} size="lg" />
            <Text
              size="xs"
              c="dimmed"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {name.replace(/([A-Z])/g, " $1").trim()}
            </Text>
          </Stack>
        </BaseCard>
      ))}
    </SimpleGrid>
  ),
};

/**
 * All sizes comparison — sm, md, lg, and xl side by side.
 */
export const AllSizes: Story = {
  args: {
    icon: <IconPencil />,
    size: "md",
  },
  render: () => {
    const sampleIcons = Object.entries(iconCatalogue).slice(0, 10);
    return (
      <BaseCard>
        <Stack gap="xl">
          <div>
            <Text size="sm" fw={700} mb="xs">
              Small (20px desktop, 16px mobile)
            </Text>
            <SimpleGrid cols={5} spacing="md">
              {sampleIcons.map(([name, IconComponent]) => (
                <Stack key={name} gap={4} align="center">
                  <Icon icon={<IconComponent />} size="sm" />
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
              {sampleIcons.map(([name, IconComponent]) => (
                <Stack key={name} gap={4} align="center">
                  <Icon icon={<IconComponent />} size="md" />
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
              {sampleIcons.map(([name, IconComponent]) => (
                <Stack key={name} gap={4} align="center">
                  <Icon icon={<IconComponent />} size="lg" />
                  <Text size="xs" c="dimmed">
                    {name}
                  </Text>
                </Stack>
              ))}
            </SimpleGrid>
          </div>

          <div>
            <Text size="sm" fw={700} mb="xs">
              Extra large (72px desktop, 48px mobile)
            </Text>
            <SimpleGrid cols={5} spacing="md">
              {sampleIcons.map(([name, IconComponent]) => (
                <Stack key={name} gap={4} align="center">
                  <Icon icon={<IconComponent />} size="xl" />
                  <Text size="xs" c="dimmed">
                    {name}
                  </Text>
                </Stack>
              ))}
            </SimpleGrid>
          </div>
        </Stack>
      </BaseCard>
    );
  },
};

/**
 * Icons with custom colours.
 */
export const WithColour: Story = {
  parameters: { layout: "padded" },
  args: {
    icon: <IconPencil />,
    size: "lg",
  },
  render: () => (
    <Group gap="lg">
      <Stack gap="xs" align="center">
        <Icon icon={<IconPencil />} size="lg" colour="red" />
        <Text size="xs" c="dimmed">
          Red
        </Text>
      </Stack>
      <Stack gap="xs" align="center">
        <Icon icon={<IconPencil />} size="lg" colour="blue" />
        <Text size="xs" c="dimmed">
          Blue
        </Text>
      </Stack>
      <Stack gap="xs" align="center">
        <Icon icon={<IconPencil />} size="lg" colour="green" />
        <Text size="xs" c="dimmed">
          Green
        </Text>
      </Stack>
      <Stack gap="xs" align="center">
        <Icon icon={<IconPencil />} size="lg" />
        <Text size="xs" c="dimmed">
          Default
        </Text>
      </Stack>
    </Group>
  ),
};

/**
 * Icons with a circular container background.
 */
export const WithContainer: Story = {
  parameters: { layout: "padded" },
  args: {
    icon: <IconPencil />,
    size: "md",
  },
  render: () => (
    <Group gap="lg">
      <Stack gap="xs" align="center">
        <Icon icon={<IconCheck />} container="teal" />
        <Text size="xs" c="dimmed">
          Light teal
        </Text>
      </Stack>
      <Stack gap="xs" align="center">
        <Icon icon={<IconX />} container="red" />
        <Text size="xs" c="dimmed">
          Light red
        </Text>
      </Stack>
      <Stack gap="xs" align="center">
        <Icon icon={<IconCheck />} container="teal" containerVariant="filled" />
        <Text size="xs" c="dimmed">
          Filled teal
        </Text>
      </Stack>
      <Stack gap="xs" align="center">
        <Icon icon={<IconX />} container="red" containerVariant="filled" />
        <Text size="xs" c="dimmed">
          Filled red
        </Text>
      </Stack>
    </Group>
  ),
};
