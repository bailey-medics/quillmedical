/**
 * RowOpenButton Stories
 *
 * The keyboard way into a clickable row. It looks like plain text; press
 * Tab to see its focus ring.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import RowOpenButton from "./RowOpenButton";

const meta: Meta<typeof RowOpenButton> = {
  title: "Tables/Row open button",
  component: RowOpenButton,
  parameters: { layout: "padded" },
  args: {
    children: "Jane Smith",
    onOpen: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof RowOpenButton>;

export const Default: Story = {};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
};
