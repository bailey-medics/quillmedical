import type { Meta, StoryObj } from "@storybook/react-vite";
import TextAreaField from "./TextAreaField";

const meta: Meta<typeof TextAreaField> = {
  title: "Form/TextAreaField",
  component: TextAreaField,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof TextAreaField>;

export const Default: Story = {
  args: {
    label: "Message",
    placeholder: "Type your message…",
    minRows: 3,
  },
};

export const Autosize: Story = {
  args: {
    label: "Notes",
    placeholder: "Add clinical notes…",
    autosize: true,
    minRows: 3,
    maxRows: 8,
  },
};

export const Required: Story = {
  args: {
    label: "Reason for referral",
    placeholder: "Describe the reason for this referral",
    required: true,
    minRows: 4,
  },
};

export const Disabled: Story = {
  args: {
    label: "Previous notes",
    value: "Patient presented with mild symptoms. Follow-up in two weeks.",
    disabled: true,
    minRows: 3,
  },
};
