import type { Meta, StoryObj } from "@storybook/react-vite";
import PlaceholderText from "./PlaceholderText";

const meta: Meta<typeof PlaceholderText> = {
  title: "Typography/PlaceholderText",
  component: PlaceholderText,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PlaceholderText>;

export const Default: Story = {
  args: {
    children: "Type a message...",
  },
};
