import type { Meta, StoryObj } from "@storybook/react-vite";
import { TeachingProgressBar } from "./TeachingProgressBar";

const meta: Meta<typeof TeachingProgressBar> = {
  title: "Teaching/Teaching progress bar",
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

/**
 * `fill` moves the bar without moving the count.
 *
 * Counting stages alone gives a bar that only jumps in whole steps,
 * which reads as stuck while one long stage runs. The video upload
 * card uses this to creep through its first stage as the bytes go up.
 */
export const PartWayThroughAStage: Story = {
  args: { current: 0, total: 4, fill: 0.42 },
};

/**
 * `showCount={false}` drops the "X of N" beside the bar.
 *
 * For progress a person is watching rather than working through. The
 * video card uses this: its four stages are internal machinery, and
 * counting them only invites the question of what they are.
 */
export const WithoutTheCount: Story = {
  args: { current: 1, total: 4, showCount: false },
};

export const DarkMode: Story = {
  ...Midway,
  globals: { colorScheme: "dark" },
};
