import type { Meta, StoryObj } from "@storybook/react-vite";
import QuillName from "./QuillName";

const meta: Meta<typeof QuillName> = {
  title: "images/QuillName",
  component: QuillName,
  tags: ["autodocs"],
  argTypes: {
    height: { control: "number" },
    alt: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof QuillName>;

export const Default: Story = {
  args: {
    height: 24,
    alt: "Quill Medical",
  },
};
