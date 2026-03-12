/**
 * ActionCardButton Storybook Stories
 *
 * Demonstrates the ActionCardButton component used inside ActionCard.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import { MemoryRouter } from "react-router-dom";
import ActionCardButton from "./ActionCardButton";

const meta: Meta<typeof ActionCardButton> = {
  title: "Button/ActionCardButton",
  component: ActionCardButton,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ActionCardButton>;

/**
 * Default ActionCardButton rendered as a link.
 */
export const Default: Story = {
  args: {
    label: "View details",
    url: "/example",
  },
};

/**
 * ActionCardButton with an onClick handler instead of a URL.
 */
export const WithOnClick: Story = {
  args: {
    label: "Create record",
    onClick: fn(),
  },
};

/**
 * Disabled state.
 */
export const Disabled: Story = {
  args: {
    label: "Unavailable",
    url: "/example",
    disabled: true,
  },
};
