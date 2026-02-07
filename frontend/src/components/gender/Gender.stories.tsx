import type { Meta, StoryObj } from "@storybook/react-vite";
import Gender from "./Gender";

const meta: Meta<typeof Gender> = {
  title: "Gender/Gender",
  component: Gender,
  tags: ["autodocs"],
  argTypes: {
    gender: {
      control: "select",
      options: ["male", "female", "unspecified", null],
      description: "Gender value",
    },
    format: {
      control: "select",
      options: ["full", "abbreviated"],
      description: "Display format",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Gender>;

/**
 * Male - full format
 */
export const Male: Story = {
  args: {
    gender: "male",
    format: "full",
  },
};

/**
 * Female - full format
 */
export const Female: Story = {
  args: {
    gender: "female",
    format: "full",
  },
};

/**
 * Unspecified
 */
export const Unspecified: Story = {
  args: {
    gender: "unspecified",
    format: "full",
  },
};
