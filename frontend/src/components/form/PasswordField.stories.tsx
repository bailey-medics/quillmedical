import type { Meta, StoryObj } from "@storybook/react-vite";
import PasswordField from "./PasswordField";

const meta: Meta<typeof PasswordField> = {
  title: "Form/PasswordField",
  component: PasswordField,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PasswordField>;

export const Default: Story = {
  args: {
    label: "Password",
    placeholder: "Enter your password",
  },
};

export const Required: Story = {
  args: {
    label: "Password",
    placeholder: "Enter your password",
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Password",
    value: "secret123",
    disabled: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
