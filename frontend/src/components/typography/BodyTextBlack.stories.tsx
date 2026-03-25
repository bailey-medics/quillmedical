import type { Meta, StoryObj } from "@storybook/react-vite";
import BodyTextBlack from "./BodyTextBlack";

const meta: Meta<typeof BodyTextBlack> = {
  title: "Typography/BodyTextBlack",
  component: BodyTextBlack,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof BodyTextBlack>;

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
