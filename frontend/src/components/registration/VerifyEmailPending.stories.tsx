import type { Meta, StoryObj } from "@storybook/react-vite";
import VerifyEmailPending from "./VerifyEmailPending";

const meta: Meta<typeof VerifyEmailPending> = {
  title: "Registration/Verify email pending",
  component: VerifyEmailPending,
  parameters: { layout: "padded" },
  args: {
    email: "user@example.com",
    resent: false,
    loading: false,
    onResend: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Resending: Story = {
  args: { loading: true },
};

export const Resent: Story = {
  args: { resent: true },
};

export const EmailNotKnown: Story = {
  args: { email: "" },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
