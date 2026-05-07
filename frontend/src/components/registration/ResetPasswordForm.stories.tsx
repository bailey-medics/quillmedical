import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import ResetPasswordForm from "./ResetPasswordForm";

const meta: Meta<typeof ResetPasswordForm> = {
  title: "Registration/ResetPasswordForm",
  component: ResetPasswordForm,
  parameters: { layout: "padded" },
  args: {
    onSubmit: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
  args: {
    error: "Invalid or expired reset link",
  },
};

export const Submitting: Story = {
  args: {
    submitting: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
