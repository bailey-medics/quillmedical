/**
 * Brand Name Component Stories
 *
 * Demonstrates the brand's name drawn as an image, Quill's or the brand
 * Storybook runs as:
 * - Default size (5px height for Storybook)
 * - Customizable height
 * - Accessible alt text
 * - Used in navigation and headers
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import QuillName from "./QuillName";

const meta: Meta<typeof QuillName> = {
  title: "Images/Brand name",
  component: QuillName,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    colour: { control: "inline-radio", options: ["white", "dark"] },
    height: { control: "number" },
    alt: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof QuillName>;

/**
 * The brand's name, white, as the ribbon shows it.
 * Standard height (5px) suitable for Storybook display.
 */
export const Default: Story = {
  args: {
    height: 5,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          background: "var(--brand-primary)",
          padding: "2rem",
          display: "inline-flex",
        }}
      >
        <Story />
      </div>
    ),
  ],
};

/**
 * Dark font variant for light backgrounds. It follows the brand Storybook
 * runs as, so `just sb ldd` shows Let's Do Digital's.
 */
export const DarkFont: Story = {
  args: {
    colour: "dark",
    height: 5,
  },
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
};
