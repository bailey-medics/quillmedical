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
import Image from "@components/images/Image";

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
  decorators: [
    (Story) => (
      <div
        style={{
          background: "var(--public-navy)",
          padding: "2rem",
          display: "inline-flex",
        }}
      >
        <Story />
      </div>
    ),
  ],
};

/** Dark font variant for light backgrounds. */
export const DarkFont: Story = {
  decorators: [
    (Story) => (
      <div
        style={{
          background: "white",
          padding: "2rem",
          display: "inline-flex",
        }}
      >
        <Story />
      </div>
    ),
  ],
  render: () => (
    <Image
      src="/quill-name.png"
      alt="Quill Medical"
      height={5}
      style={{ marginRight: "0.5rem" }}
    />
  ),
};
