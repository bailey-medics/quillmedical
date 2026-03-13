/**
 * ActionCardButton Storybook Stories
 *
 * Demonstrates the ActionCardButton component used inside ActionCard.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import ActionCardButton from "./ActionCardButton";
import { BUTTON_STATES, buttonStateCss } from "@/stories/button-states";
import { Group, Text } from "@mantine/core";

const CONTAINER_NOTE =
  "Constrained to 18rem for display. In practice, the button is full-width and adapts to its parent container.";

const meta: Meta<typeof ActionCardButton> = {
  title: "Button/ActionCardButton",
  component: ActionCardButton,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ActionCardButton>;

/**
 * Default ActionCardButton rendered as a link.
 *
 * Constrained to 18rem here for display purposes.
 * In practice, the button is full-width and adapts to its parent container.
 */
export const Default: Story = {
  args: {
    label: "View details",
    url: "/example",
  },
  decorators: [
    (Story) => (
      <div>
        <div style={{ width: "18rem" }}>
          <Story />
        </div>
        <Text size="sm" c="dimmed" mt="md">
          {CONTAINER_NOTE}
        </Text>
      </div>
    ),
  ],
};

/**
 * All interaction states side-by-side.
 *
 * Constrained to 18rem here for display purposes.
 * In practice, the button is full-width and adapts to its parent container.
 */
export const States: Story = {
  args: {
    label: "View details",
    url: "/example",
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
              width: "18rem",
            }}
          >
            <ActionCardButton label="View details" url="/example" {...props} />
            <div style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
              {label}
            </div>
          </div>
        ))}
      </Group>
      <Text size="sm" c="dimmed" mt="md">
        {CONTAINER_NOTE}
      </Text>
    </>
  ),
};
