/**
 * VerificationPanel Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import VerificationPanel from "./VerificationPanel";
import { changedVerification, unchangedVerification } from "./fixtures";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof VerificationPanel> = {
  title: "Passport/Verification panel",
  component: VerificationPanel,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof VerificationPanel>;

export const Unchanged: Story = {
  args: { verification: unchangedVerification },
};

export const Changed: Story = {
  args: { verification: changedVerification },
};

export const BothHalves: Story = {
  render: () => (
    <Stack gap="sm">
      <VerificationPanel verification={unchangedVerification} />
      <StoryNote>
        Both halves are always shown. A match proves the record has not changed;
        it does not prove a registration, and it proves nothing to somebody who
        distrusts Quill, since the same system computed the hash. Showing only
        the first would overstate what happened.
      </StoryNote>
    </Stack>
  ),
};
