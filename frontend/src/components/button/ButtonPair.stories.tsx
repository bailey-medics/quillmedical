/**
 * ButtonPair Storybook Stories
 *
 * Demonstrates the ButtonPair component for accept/cancel actions.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Loader } from "@mantine/core";
import ButtonPair from "./ButtonPair";

const meta: Meta<typeof ButtonPair> = {
  title: "Button/Button pair",
  component: ButtonPair,
  parameters: {
    layout: "padded",
  },
  args: {
    onAccept: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ButtonPair>;

/** Default button pair */
export const Default: Story = {};

/** Accept button disabled */
export const AcceptDisabled: Story = {
  args: {
    acceptDisabled: true,
  },
};

/** Accept button in submitting state */
export const Submitting: Story = {
  args: {
    acceptDisabled: true,
    acceptChildren: (
      <span style={{ display: "grid", placeItems: "center" }}>
        <span style={{ gridArea: "1/1", visibility: "hidden" }}>Accept</span>
        <span
          style={{
            gridArea: "1/1",
            visibility: "visible",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Loader size="xs" color="white" aria-hidden="true" />
          Saving…
        </span>
      </span>
    ),
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
