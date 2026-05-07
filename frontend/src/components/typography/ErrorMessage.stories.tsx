import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorMessage from "./ErrorMessage";

const meta: Meta<typeof ErrorMessage> = {
  title: "Foundations/Typography/ErrorMessage",
  component: ErrorMessage,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof ErrorMessage>;

export const Default: Story = {
  args: {
    children: "Please select a patient",
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
