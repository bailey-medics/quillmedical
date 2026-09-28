/**
 * ReflectionTable Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import ReflectionTable from "./ReflectionTable";
import { reflections } from "./fixtures";

const meta: Meta<typeof ReflectionTable> = {
  title: "Passport/Reflection table",
  component: ReflectionTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof ReflectionTable>;

export const Default: Story = {
  args: { reflections, onSelect: fn() },
};

export const Empty: Story = {
  args: { reflections: [], onSelect: fn() },
};

export const Loading: Story = {
  args: { reflections: [], isLoading: true, onSelect: fn() },
};
