/**
 * BurgerButton Storybook Stories
 *
 * Demonstrates the BurgerButton component with real pseudo states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import BurgerButton from "./BurgerButton";
import { StateRow } from "@/stories/variants";
import { Group } from "@mantine/core";

const meta: Meta<typeof BurgerButton> = {
  title: "Button/BurgerButton",
  component: BurgerButton,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {
    navOpen: false,
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof BurgerButton>;

/** Default closed state. */
export const Default: Story = {};

/** All interaction states side-by-side. */
export const States: Story = {
  render: () => (
    <Group gap="xl">
      <StateRow label="default">
        <BurgerButton navOpen={false} onClick={fn()} />
      </StateRow>
      <StateRow label="hover" state="hover">
        <BurgerButton navOpen={false} onClick={fn()} />
      </StateRow>
      <StateRow label="active" state={["hover", "active"]}>
        <BurgerButton navOpen={false} onClick={fn()} />
      </StateRow>
      <StateRow label="focus-visible" state="focus-visible">
        <BurgerButton navOpen={false} onClick={fn()} />
      </StateRow>
    </Group>
  ),
};
