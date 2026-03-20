import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicTopRibbon from "./PublicTopRibbon";

const meta: Meta<typeof PublicTopRibbon> = {
  title: "Public/Ribbons/PublicTopRibbon",
  component: PublicTopRibbon,
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
  },
  argTypes: {
    onBurgerClick: { action: "burger-clicked" },
  },
};
export default meta;

type Story = StoryObj<typeof PublicTopRibbon>;

/** Wide — shows Quill logo */
export const Wide: Story = {
  args: {
    isNarrow: false,
    navOpen: false,
  },
};

/** Narrow — shows hamburger menu */
export const Narrow: Story = {
  args: {
    isNarrow: true,
    navOpen: false,
  },
};
