/**
 * Quill Logo Component Stories
 *
 * Demonstrates the Quill Medical logo SVG component:
 * - Default size (128px height)
 * - Customizable height
 * - Accessible alt text
 * - Maintains aspect ratio
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import QuillLogo from "./QuillLogo";

const meta: Meta<typeof QuillLogo> = {
  title: "Images/QuillLogo",
  component: QuillLogo,
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
 * Standard size (128px height) suitable for headers and branding.
 */
export const Default: Story = {
  args: {
    height: 128,
    alt: "Quill",
  },
};
