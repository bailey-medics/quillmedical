/**
 * Quill Name Component Stories
 *
 * Demonstrates the "Quill Medical" text logo SVG:
 * - Default size (24px height)
 * - Customizable height
 * - Accessible alt text
 * - Used in navigation and headers
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import QuillName from "./QuillName";

const meta: Meta<typeof QuillName> = {
  title: "Images/QuillName",
  component: QuillName,
  tags: ["autodocs"],
  argTypes: {
    height: { control: "number" },
    alt: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof QuillName>;

/**
 * Default "Quill Medical" text logo.
 * Standard height (24px) suitable for top navigation bar.
 */
export const Default: Story = {
  args: {
    height: 24,
    alt: "Quill Medical",
  },
};
