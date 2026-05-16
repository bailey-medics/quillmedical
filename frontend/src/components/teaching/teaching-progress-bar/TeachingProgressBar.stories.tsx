import type { Meta, StoryObj } from "@storybook/react-vite";
import { TeachingProgressBar } from "./TeachingProgressBar";

const meta: Meta<typeof TeachingProgressBar> = {
  title: "Teaching/TeachingProgressBar",
  component: TeachingProgressBar,
};

export default meta;
type Story = StoryObj<typeof TeachingProgressBar>;

export const Start: Story = {
  args: { current: 1, total: 120 },
};

export const Midway: Story = {
  args: { current: 60, total: 120 },
};

export const NearEnd: Story = {
  args: { current: 118, total: 120 },
};

export const Complete: Story = {
  args: { current: 120, total: 120 },
};

export const DarkMode: Story = {
  ...Midway,
  globals: { colorScheme: "dark" },
};
