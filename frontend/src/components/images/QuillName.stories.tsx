/**
 * Quill Name Component Stories
 *
 * Demonstrates the "Quill Medical" text logo SVG:
 * - Default size (5px height for Storybook)
 * - Customizable height
 * - Accessible alt text
 * - Used in navigation and headers
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import QuillName from "./QuillName";

const meta: Meta<typeof QuillName> = {
  title: "Images/QuillName",
  component: QuillName,
  parameters: {
    layout: "padded",
  },
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
 * Standard height (5px) suitable for Storybook display.
 */
export const Default: Story = {
  args: {
    height: 5,
    alt: "Quill Medical",
  },
};
