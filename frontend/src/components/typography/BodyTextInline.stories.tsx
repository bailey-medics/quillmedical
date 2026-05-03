import type { Meta, StoryObj } from "@storybook/react-vite";
import BodyTextInline from "./BodyTextInline";

const meta: Meta<typeof BodyTextInline> = {
  title: "Foundations/Typography/BodyTextInline",
  component: BodyTextInline,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof BodyTextInline>;

export const Default: Story = {
  args: {
    children:
      "Thank you for the letter, I've received it and will review with my GP.",
  },
};

export const MultiLine: Story = {
  args: {
    children:
      "Hi Dr Corbett,\n\nI wanted to follow up on our last appointment.\n\nKind regards,\nSarah",
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
