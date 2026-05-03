import type { Meta, StoryObj } from "@storybook/react-vite";
import ExamCloseButton from "./ExamCloseButton";

const meta: Meta<typeof ExamCloseButton> = {
  title: "Teaching/ExamCloseButton",
  component: ExamCloseButton,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ExamCloseButton>;

export const Default: Story = {
  args: {
    onConfirm: () => {},
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
