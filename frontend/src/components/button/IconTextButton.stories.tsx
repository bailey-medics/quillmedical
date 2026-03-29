/**
 * IconTextButton Storybook Stories
 *
 * Demonstrates the IconTextButton component with interaction states
 * and loading behaviour.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Group } from "@mantine/core";
import { StateRow } from "@/stories/variants";
import IconTextButton from "./IconTextButton";

const meta: Meta<typeof IconTextButton> = {
  title: "Button/IconTextButton",
  component: IconTextButton,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {
    icon: "refresh",
    label: "Sync all",
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof IconTextButton>;

/** Default interactive IconTextButton. */
export const Default: Story = {};

/** Arrow-left icon variant for back navigation. */
export const ArrowLeft: Story = {
  args: {
    icon: "arrowLeft",
    label: "Back to dashboard",
  },
};

/** Light variant for secondary actions. */
export const LightVariant: Story = {
  args: {
    icon: "arrowLeft",
    label: "Back to dashboard",
    variant: "light",
  },
};

/** All interaction states side-by-side. */
export const States: Story = {
  render: () => (
    <Group gap="xl">
      <StateRow label="default">
        <IconTextButton icon="refresh" label="Sync all" />
      </StateRow>
      <StateRow label="hover" state="hover">
        <IconTextButton icon="refresh" label="Sync all" />
      </StateRow>
      <StateRow label="active" state={["hover", "active"]}>
        <IconTextButton icon="refresh" label="Sync all" />
      </StateRow>
      <StateRow label="focus-visible" state="focus-visible">
        <IconTextButton icon="refresh" label="Sync all" />
      </StateRow>
      <StateRow label="disabled">
        <IconTextButton icon="refresh" label="Sync all" disabled />
      </StateRow>
    </Group>
  ),
};
