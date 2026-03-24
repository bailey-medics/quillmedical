import type { Meta, StoryObj } from "@storybook/react-vite";
import TextField from "./TextField";

const meta: Meta<typeof TextField> = {
  title: "Form/TextField",
  component: TextField,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof TextField>;

export const Default: Story = {
  args: {
    label: "Subject",
    placeholder: "e.g. Prescription renewal",
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
