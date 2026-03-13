/**
 * AddButton Storybook Stories
 *
 * Demonstrates the AddButton component with different labels and states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import AddButton from "./AddButton";
import { BUTTON_STATES, buttonStateCss } from "@/stories/button-states";
import { Group } from "@mantine/core";

const meta: Meta<typeof AddButton> = {
  title: "Button/AddButton",
  component: AddButton,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AddButton>;

/**
 * Default interactive AddButton.
 */
export const Default: Story = {
  args: {
    label: "Add user",
  },
};

/**
 * All interaction states side-by-side.
 */
export const States: Story = {
  args: {
    label: "Add user",
  },
  render: () => (
    <>
      <style>{buttonStateCss}</style>
      <Group gap="xl">
        {BUTTON_STATES.map(({ label, props, className }) => (
          <div
            key={label}
            className={className}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <AddButton label="Add user" {...props} />
            <div style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
              {label}
            </div>
          </div>
        ))}
      </Group>
    </>
  ),
};
