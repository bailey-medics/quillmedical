/**
 * SignOffRow Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import SignOffRow from "./SignOffRow";
import { declined, requested, signedOff } from "./fixtures";

const meta: Meta<typeof SignOffRow> = {
  title: "Passport/Sign-off row",
  component: SignOffRow,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SignOffRow>;

/**
 * Read-only stories set `onSelect: undefined` explicitly. `argTypesRegex`
 * in `.storybook/preview.tsx` fills any unset `on*` prop with a spy, which
 * would render the row as a button.
 */
export const SignedOff: Story = {
  args: { signOff: signedOff, onSelect: undefined },
};

/** Awaiting the assessor, so it says what was asked for. */
export const Requested: Story = {
  args: {
    signOff: {
      ...requested,
      requested_level: {
        id: "supervised",
        name: "Can perform under supervision",
      },
    },
    onSelect: undefined,
  },
};

/** Signed at a different level from the one asked for. */
export const SignedAtADifferentLevel: Story = {
  args: {
    signOff: {
      ...signedOff,
      requested_level: { id: "teach", name: "Can teach others" },
    },
    onSelect: undefined,
  },
};

export const Declined: Story = {
  args: { signOff: declined, onSelect: undefined },
};

export const Selectable: Story = {
  args: { signOff: signedOff, onSelect: fn() },
};
