import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import PublicBurgerButton from "./PublicBurgerButton";
import { StateRow } from "@/stories/variants";
import { Group } from "@mantine/core";

const meta: Meta<typeof PublicBurgerButton> = {
  title: "Public/Button/PublicBurgerButton",
  component: PublicBurgerButton,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          background: "var(--public-navy)",
          padding: "2rem",
        }}
      >
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  args: {
    navOpen: false,
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof PublicBurgerButton>;

/** Default closed state. */
export const Default: Story = {};

/** All interaction states side-by-side. */
export const States: Story = {
  render: () => (
    <Group gap="xl">
      <StateRow label="default">
        <PublicBurgerButton navOpen={false} onClick={fn()} />
      </StateRow>
      <StateRow label="hover" state="hover">
        <PublicBurgerButton navOpen={false} onClick={fn()} />
      </StateRow>
      <StateRow label="active" state={["hover", "active"]}>
        <PublicBurgerButton navOpen={false} onClick={fn()} />
      </StateRow>
      <StateRow label="focus-visible" state="focus-visible">
        <PublicBurgerButton navOpen={false} onClick={fn()} />
      </StateRow>
    </Group>
  ),
};
