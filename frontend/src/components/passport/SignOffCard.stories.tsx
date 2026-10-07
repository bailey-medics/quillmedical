/**
 * SignOffCard Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import SignOffCard from "./SignOffCard";
import { requested, requestedForLung, signedOff } from "./fixtures";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof SignOffCard> = {
  title: "Passport/Sign-off card",
  component: SignOffCard,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SignOffCard>;

export const SignedOff: Story = {
  args: { signOff: signedOff },
};

/** The holder's view of an open request, naming who it was sent to. */
export const Requested: Story = {
  args: { signOff: { ...requested, assessor_email: "a.okonkwo@nhs.net" } },
};

/** Signed off at a different level from the one asked for. */
export const SignedAtADifferentLevel: Story = {
  args: {
    signOff: {
      ...signedOff,
      requested_level: { id: "teach", name: "Can teach others" },
      comments: "Not yet teaching it; independent, yes.",
    },
  },
};

export const ThreeClocks: Story = {
  render: () => (
    <Stack gap="sm">
      <SignOffCard signOff={signedOff} />
      <StoryNote>
        Observed on 12 March, signed on 14 March. Consultants often sign days or
        weeks after watching, so the gap is ordinary. The card shows both and
        draws no conclusion from the distance between them.
      </StoryNote>
    </Stack>
  ),
};

/** A sign-off for one scope of a competency, named after the competency. */
export const WithAScope: Story = {
  args: { signOff: requestedForLung },
};
