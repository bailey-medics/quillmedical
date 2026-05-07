import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
import TextField from "./TextField";

const meta: Meta<typeof TextField> = {
  title: "Form/TextField",
  component: TextField,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof TextField>;

export const Default: Story = {
  args: {
    label: "Subject",
    placeholder: "e.g. Prescription renewal",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Email address",
    description: "Receives certificate copies when students pass",
    placeholder: "coordinator@example.com",
  },
};

export const Required: Story = {
  args: {
    label: "Full name",
    placeholder: "Enter your full name",
    required: true,
  },
};

export const WithValue: Story = {
  args: {
    label: "Email address",
    value: "gemma@example.com",
    readOnly: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Username",
    value: "gemma.corbett",
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: "Email address",
    value: "gemma@@example.com",
    error: "Please enter a valid email address",
  },
};

export const DarkMode: Story = {
  ...WithDescription,
  globals: { colorScheme: "dark" },
  render: (args) => (
    <Stack gap="xl">
      <BaseCard>
        <TextField {...args} required />
      </BaseCard>
      <TextField {...args} required />
      <BaseCard>
        <TextField
          label="Email address - disabled"
          value="gemma@example.com"
          disabled
        />
      </BaseCard>
      <BaseCard>
        <TextField
          label="Email address - error"
          value="gemma@@example.com"
          error="Please enter a valid email address"
        />
      </BaseCard>
    </Stack>
  ),
};
