import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicNotFound from "./PublicNotFound";

const meta: Meta<typeof PublicNotFound> = {
  title: "Public/Layouts/PublicNotFound",
  component: PublicNotFound,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof PublicNotFound>;

export const Default: Story = {};

export const CustomHome: Story = {
  args: {
    homeHref: "/about",
  },
};
