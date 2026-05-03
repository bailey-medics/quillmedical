import type { Meta, StoryObj } from "@storybook/react-vite";
import TextLink from "./TextLink";

const meta: Meta<typeof TextLink> = {
  title: "Foundations/Typography/TextLink",
  component: TextLink,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof TextLink>;

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

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
