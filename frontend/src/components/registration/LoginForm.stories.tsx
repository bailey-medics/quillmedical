import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import LoginForm from "./LoginForm";

const meta: Meta<typeof LoginForm> = {
  title: "Registration/LoginForm",
  component: LoginForm,
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
    error: "Invalid username or password",
  },
};

export const RequireTotp: Story = {
  args: {
    requireTotp: true,
    error: "Enter the 6-digit authenticator code",
  },
};

export const TotpInvalidCode: Story = {
  args: {
    requireTotp: true,
    error:
      "Wrong code entered, please try entering your 6-digit authenticator code again",
  },
};

export const Submitting: Story = {
  args: {
    submitting: true,
  },
};

export const NoRegisterLink: Story = {
  args: {
    registerPath: null,
  },
};
