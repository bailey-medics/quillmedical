/**
 * SignOffForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import SignOffForm from "./SignOffForm";
import { requested } from "./fixtures";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof SignOffForm> = {
  title: "Passport/Sign-off form",
  component: SignOffForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SignOffForm>;

export const Default: Story = {
  args: {
    signOff: requested,
    onSubmit: fn(),
    onCancel: fn(),
  },
};

/**
 * A request for a competency on the RCR entrustment scale. The level
 * asked for is chosen to start with; choosing another turns the caveats
 * field into a required "Why a different level?".
 */
export const OnAScale: Story = {
  args: {
    signOff: {
      ...requested,
      competency: {
        id: "define_radiotherapy_target_volume",
        name: "Interpret imaging for target volume and organ-at-risk definition",
      },
      level: { id: "unsupervised", name: "Entrusted to act unsupervised" },
      requested_level: {
        id: "unsupervised",
        name: "Entrusted to act unsupervised",
      },
    },
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const Submitting: Story = {
  args: {
    signOff: requested,
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: true,
  },
};

/**
 * The declaration is the signature — the reason there is no drawing
 * canvas here.
 */
export const TheDeclarationIsTheSignature: Story = {
  render: (args) => (
    <Stack gap="sm">
      <SignOffForm {...args} />
      <StoryNote>
        Submission stays disabled until a basis is chosen and the box is ticked.
        No drawn or uploaded signature: a scribble looks more official and
        proves less, since anyone can draw anyone&rsquo;s name and no reference
        specimens exist to check one against. What carries the weight is the
        named account, the timestamp, the frozen registrations and the content
        hash.
      </StoryNote>
    </Stack>
  ),
  args: {
    signOff: requested,
    onSubmit: fn(),
    onCancel: fn(),
  },
};
