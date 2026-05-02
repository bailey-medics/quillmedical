import type { Meta, StoryObj } from "@storybook/react-vite";
import BodyTextMuted from "./BodyTextMuted";

const meta: Meta<typeof BodyTextMuted> = {
  title: "Foundations/Typography/BodyTextMuted",
  component: BodyTextMuted,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof BodyTextMuted>;

export const Default: Story = {
  args: {
    children:
      "Secondary text used for supporting information and descriptions.",
  },
};
