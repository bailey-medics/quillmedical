import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import type { FormSubmitResult } from "@/components/form/Form";
import ForgotPasswordForm from "./ForgotPasswordForm";

const successResult: FormSubmitResult = {
  state: "success",
  message: {
    title: "Check your inbox",
    description:
      "If an account with that email exists, we've sent a reset link. Please check your inbox.",
  },
};

const errorResult: FormSubmitResult = {
  state: "error",
  message: {
    title: "Something went wrong",
    description: "Please try again.",
  },
};

async function fillAndSubmit(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByLabelText("Email *"), "user@example.com");
  await userEvent.click(canvas.getByTestId("submit-button"));
}

const meta: Meta<typeof ForgotPasswordForm> = {
  title: "Registration/ForgotPasswordForm",
  component: ForgotPasswordForm,
  parameters: { layout: "padded" },
  args: {
    onSubmit: () => new Promise(() => {}),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
  args: {
    onSubmit: async () => errorResult,
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const WithSuccess: Story = {
  args: {
    onSubmit: async () => successResult,
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const Submitting: Story = {
  args: {
    onSubmit: () => new Promise(() => {}),
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
