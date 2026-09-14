/**
 * SignOffCard Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import SignOffCard from "./SignOffCard";
import { requested, signedOff } from "./fixtures";
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

export const Requested: Story = {
  args: { signOff: requested },
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
