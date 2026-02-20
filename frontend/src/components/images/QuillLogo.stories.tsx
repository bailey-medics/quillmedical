/**
 * Quill Logo Component Stories
 *
 * Demonstrates the Quill Medical logo SVG component:
 * - Default size (5px height for Storybook)
 * - Customizable height
 * - Accessible alt text
 * - Maintains aspect ratio
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import QuillLogo from "./QuillLogo";

const meta: Meta<typeof QuillLogo> = {
  title: "Images/QuillLogo",
  component: QuillLogo,
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

type Story = StoryObj<typeof QuillLogo>;

/**
 * Default Quill Medical logo.
 * Standard size (5px height) suitable for Storybook display.
 */
export const Default: Story = {
  args: {
    height: 5,
    alt: "Quill",
  },
};
