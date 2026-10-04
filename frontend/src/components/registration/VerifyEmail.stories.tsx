import type { Meta, StoryObj } from "@storybook/react-vite";
import VerifyEmail from "./VerifyEmail";

const meta: Meta<typeof VerifyEmail> = {
  title: "Registration/Verify email",
  component: VerifyEmail,
  parameters: { layout: "padded" },
  args: {
    status: "success",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Verified: Story = {};

export const Verifying: Story = {
  args: { status: "loading" },
};

export const Failed: Story = {
  args: { status: "error" },
};

export const DarkMode: Story = {
  ...Verified,
  globals: { colorScheme: "dark" },
};
