import type { Meta, StoryObj } from "@storybook/react-vite";
import Gender from "./Gender";
import BodyText from "@/components/typography/BodyText";

const meta: Meta<typeof Gender> = {
  title: "data/Gender",
  component: Gender,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BodyText>
        <Story />
      </BodyText>
    ),
  ],
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

export const DarkMode: Story = {
  ...Male,
  globals: { colorScheme: "dark" },
};
