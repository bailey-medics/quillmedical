import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, Stack } from "@mantine/core";
import GenderIcon from "./GenderIcon";

const meta: Meta<typeof GenderIcon> = {
  title: "Gender/GenderIcon",
  component: GenderIcon,
  parameters: {
    layout: "padded",
  },
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
 * All icons at small, medium, and large sizes.
 */
export const Sizes: Story = {
  render: () => (
    <Stack gap="lg">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size}>
          <Group gap="lg">
            {(["male", "female", "unspecified"] as const).map((gender) => (
              <GenderIcon key={gender} gender={gender} size={size} />
            ))}
          </Group>
          <div style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
            {size === "lg" ? `${size} (default)` : size}
          </div>
        </div>
      ))}
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
