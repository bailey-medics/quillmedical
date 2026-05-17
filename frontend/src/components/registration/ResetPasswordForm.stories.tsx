import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import type { FormSubmitResult } from "@/components/form/Form";
import ResetPasswordForm from "./ResetPasswordForm";

const errorResult: FormSubmitResult = {
  state: "error",
  message: {
    title: "Invalid or expired reset link",
  },
};

async function fillAndSubmit(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByLabelText("New password *"),
    "SecurePass123!",
  );
  await userEvent.type(
    canvas.getByLabelText("Confirm password *"),
    "SecurePass123!",
  );
  await userEvent.click(canvas.getByTestId("submit-button"));
}

const meta: Meta<typeof ResetPasswordForm> = {
  title: "Registration/Reset password form",
  component: ResetPasswordForm,
  parameters: { layout: "padded" },
  args: {
    onSubmit: () => new Promise(() => {}),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = {
  args: {
    onSubmit: () => new Promise(() => {}),
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const WithError: Story = {
  args: {
    onSubmit: async () => errorResult,
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
