import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
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

export const WithDescription: Story = {
  args: {
    label: "Password",
    description: "Must be at least 8 characters with one uppercase letter",
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
  ...WithDescription,
  globals: { colorScheme: "dark" },
  render: (args) => (
    <Stack gap="xl">
      <BaseCard>
        <PasswordField {...args} />
      </BaseCard>
      <PasswordField {...args} />
    </Stack>
  ),
};
