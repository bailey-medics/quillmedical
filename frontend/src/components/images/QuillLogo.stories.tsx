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
import { colours } from "@/styles/colours";

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
    colour: {
      control: "select",
      options: ["default", "light-grey", "white"],
    },
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

/**
 * Light grey variant of the Quill Medical logo.
 */
export const LightGrey: Story = {
  args: {
    height: 5,
    colour: "light-grey",
  },
  decorators: [
    (Story) => (
      <div style={{ background: colours.navy, padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * White variant of the Quill Medical logo.
 */
export const White: Story = {
  args: {
    height: 5,
    colour: "white",
  },
  decorators: [
    (Story) => (
      <div style={{ background: colours.navy, padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
};
