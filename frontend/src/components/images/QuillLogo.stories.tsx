import type { Meta, StoryObj } from "@storybook/react-vite";
import QuillLogo from "./QuillLogo";

const meta: Meta<typeof QuillLogo> = {
  title: "images/QuillLogo",
  component: QuillLogo,
  tags: ["autodocs"],
  argTypes: {
    size: { control: "number" },
    alt: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof QuillLogo>;

export const Default: Story = {
  args: {
    size: 128,
    alt: "Quill",
  },
};
