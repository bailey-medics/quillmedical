import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Text } from "@mantine/core";
import GenderIcon from "./GenderIcon";

const meta: Meta<typeof GenderIcon> = {
  title: "Gender/GenderIcon",
  component: GenderIcon,
  tags: ["autodocs"],
  argTypes: {
    gender: {
      control: "select",
      options: ["male", "female", "unspecified", null],
      description: "Gender value",
    },
  },
};

export default meta;
type Story = StoryObj<typeof GenderIcon>;

/**
 * Male icon
 */
export const Male: Story = {
  args: {
    gender: "male",
  },
};

/**
 * Female icon
 */
export const Female: Story = {
  args: {
    gender: "female",
  },
};

/**
 * Unspecified icon
 */
export const Unspecified: Story = {
  args: {
    gender: "unspecified",
  },
};

/**
 * Male icon sizes (small, medium, large)
 */
export const Sizes: Story = {
  render: () => (
    <Stack gap="lg" align="center">
      <div style={{ textAlign: "center" }}>
        <Text size="sm" c="dimmed" mb="xs">
          Small (24px)
        </Text>
        <GenderIcon gender="male" size={24} />
      </div>
      <div style={{ textAlign: "center" }}>
        <Text size="sm" c="dimmed" mb="xs">
          Medium (29px)
        </Text>
        <GenderIcon gender="male" size={29} />
      </div>
      <div style={{ textAlign: "center" }}>
        <Text size="sm" c="dimmed" mb="xs">
          Large (38px)
        </Text>
        <GenderIcon gender="male" size={38} />
      </div>
    </Stack>
  ),
};

/**
 * Loading state
 */
export const Loading: Story = {
  args: {
    gender: "male",
    loading: true,
  },
};
