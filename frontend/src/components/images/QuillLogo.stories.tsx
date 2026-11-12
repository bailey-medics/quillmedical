/**
 * Brand Logo Component Stories
 *
 * Demonstrates the brand's logo, Quill's or the brand Storybook runs as:
 * - Default size (5px height for Storybook)
 * - Customizable height
 * - Accessible alt text
 * - Maintains aspect ratio
 */
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import QuillLogo from "./QuillLogo";

const meta: Meta<typeof QuillLogo> = {
  title: "Images/Brand logo",
  component: QuillLogo,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    height: { control: "number" },
    alt: { control: "text" },
    colour: {
      control: "select",
      options: ["auto", "default", "light-grey", "white"],
    },
  },
};

export default meta;

type Story = StoryObj<typeof QuillLogo>;

/**
 * Fills the whole canvas with the brand's own colour, in light and dark
 * mode alike. The logo sits in the top left, 1rem in, where the padded
 * layout puts the Default story's.
 */
const onBrandColour: Decorator = (Story) => (
  <div
    style={{
      background: "var(--brand-primary)",
      minHeight: "100vh",
      padding: "1rem",
    }}
  >
    <Story />
  </div>
);

/**
 * The brand's logo: for Quill, the navy feather. The story is held in
 * light mode, so the whole canvas is white whatever the toolbar says.
 * Standard size (5px height) suitable for Storybook display.
 */
export const Default: Story = {
  globals: { colorScheme: "light" },
  args: {
    height: 5,
    colour: "default",
  },
};

/**
 * Light grey variant of the logo, on the brand's colour. A brand with one
 * logo shows it.
 */
export const LightGrey: Story = {
  args: {
    height: 5,
    colour: "light-grey",
  },
  parameters: { layout: "fullscreen" },
  decorators: [onBrandColour],
};

/**
 * White variant of the logo, on the brand's colour. A brand with one logo
 * shows it.
 */
export const White: Story = {
  args: {
    height: 5,
    colour: "white",
  },
  parameters: { layout: "fullscreen" },
  decorators: [onBrandColour],
};
