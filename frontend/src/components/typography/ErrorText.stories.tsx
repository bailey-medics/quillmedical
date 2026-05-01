import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorText from "./ErrorText";

const meta: Meta<typeof ErrorText> = {
  title: "Foundations/Typography/ErrorText",
  component: ErrorText,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ErrorText>;

export const Default: Story = {
  args: {
    children: "Please select a patient",
  },
};
