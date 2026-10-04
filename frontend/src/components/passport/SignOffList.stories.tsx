/**
 * SignOffList Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import SignOffList from "./SignOffList";
import { declined, signOffs, signedOff } from "./fixtures";

const meta: Meta<typeof SignOffList> = {
  title: "Passport/Sign-off list",
  component: SignOffList,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SignOffList>;

export const Default: Story = {
  args: { title: "Sign-offs", signOffs, onSelect: fn() },
};

/**
 * One competency declined and then signed off: two rows, where the
 * competency list would show one.
 */
export const OneCompetencyTwice: Story = {
  args: {
    title: "Perform bronchoscopy",
    signOffs: [signedOff, declined],
    onSelect: fn(),
  },
};

/** Read-only: rows are plain blocks with no hover. */
export const ReadOnly: Story = {
  args: { title: "Sign-offs", signOffs, onSelect: undefined },
};

/** Placeholder rows, while the sign-offs are being fetched. */
export const Loading: Story = {
  args: { title: "Sign-offs", signOffs: [], isLoading: true },
};
