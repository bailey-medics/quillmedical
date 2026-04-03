import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import ForgotPasswordForm from "./ForgotPasswordForm";

const meta: Meta<typeof ForgotPasswordForm> = {
  title: "Registration/ForgotPasswordForm",
  component: ForgotPasswordForm,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    onSubmit: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
  args: {
    error: "Something went wrong. Please try again.",
  },
};

export const WithSuccess: Story = {
  args: {
    success:
      "If an account with that email exists, we've sent a reset link. Please check your inbox.",
  },
};

export const Submitting: Story = {
  args: {
    submitting: true,
  },
};
