import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
import EmailField from "./EmailField";

const meta: Meta<typeof EmailField> = {
  title: "Form/EmailField",
  component: EmailField,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof EmailField>;

export const Default: Story = {
  args: {
    label: "Email address",
    placeholder: "name@example.com",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Email address",
    description: "We will send a confirmation link to this address",
    placeholder: "name@example.com",
  },
};

export const Required: Story = {
  args: {
    label: "Email address",
    placeholder: "name@example.com",
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Email address",
    value: "gemma.corbett@example.com",
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
        <EmailField {...args} required />
      </BaseCard>
      <BaseCard>
        <EmailField
          {...args}
          value="gemma@@example.com"
          error="Please enter a valid email address"
        />
      </BaseCard>
    </Stack>
  ),
};
