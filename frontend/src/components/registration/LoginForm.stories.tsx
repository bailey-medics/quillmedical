import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import type { FormSubmitResult } from "@/components/form/Form";
import LoginForm from "./LoginForm";

const errorResult = (message: string): FormSubmitResult => ({
  state: "error",
  message: { title: message },
});

async function fillAndSubmit(
  canvasElement: HTMLElement,
  { totp }: { totp?: boolean } = {},
) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByLabelText("Username *"), "testuser");
  await userEvent.type(canvas.getByLabelText("Password *"), "password123");
  if (totp) {
    await userEvent.type(
      canvas.getByLabelText("Authenticator code *"),
      "123456",
    );
  }
  await userEvent.click(canvas.getByTestId("submit-button"));
}

const meta: Meta<typeof LoginForm> = {
  title: "Registration/LoginForm",
  component: LoginForm,
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
    onSubmit: async () => errorResult("Invalid username or password"),
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const RequireTotp: Story = {
  args: {
    requireTotp: true,
  },
};

export const TotpInvalidCode: Story = {
  args: {
    requireTotp: true,
    onSubmit: async () =>
      errorResult(
        "Wrong code entered, please try entering your 6-digit authenticator code again",
      ),
  },
  play: async ({ canvasElement }) =>
    fillAndSubmit(canvasElement, { totp: true }),
};

export const Submitting: Story = {
  args: {
    onSubmit: () => new Promise(() => {}),
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const NoRegisterLink: Story = {
  args: {
    registerPath: null,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
