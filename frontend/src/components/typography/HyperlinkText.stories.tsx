import type { Meta, StoryObj } from "@storybook/react-vite";
import HyperlinkText from "./HyperlinkText";

const meta: Meta<typeof HyperlinkText> = {
  title: "Foundations/Typography/HyperlinkText",
  component: HyperlinkText,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof HyperlinkText>;

export const Default: Story = {
  args: {
    to: "/register",
    children: "Don't have an account? Register",
  },
};

export const ShortLink: Story = {
  args: {
    to: "/about",
    children: "Learn more",
  },
};
