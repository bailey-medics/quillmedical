import type { Meta, StoryObj } from "@storybook/react-vite";
import Figure from "./Figure";

const meta: Meta<typeof Figure> = {
  title: "Teaching/Figure",
  component: Figure,
};

export default meta;
type Story = StoryObj<typeof Figure>;

export const WithCaption: Story = {
  args: {
    src: "/storybook/paris-classification.png",
    alt: "Overview of polyp morphology categories",
    caption: "Figure 1: Paris classification overview",
  },
};

export const WithoutCaption: Story = {
  args: {
    src: "https://placehold.co/600x400/e2e8f0/475569?text=Clinical+image",
    alt: "Clinical image of colorectal polyp",
  },
};

export const DarkMode: Story = {
  ...WithCaption,
  globals: { colorScheme: "dark" },
};
