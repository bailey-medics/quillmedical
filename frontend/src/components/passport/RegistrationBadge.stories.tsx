/**
 * RegistrationBadge Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import RegistrationBadge from "./RegistrationBadge";
import { declaredRegistration, verifiedRegistration } from "./fixtures";
import { StoryNote, VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof RegistrationBadge> = {
  title: "Passport/Registration badge",
  component: RegistrationBadge,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof RegistrationBadge>;

export const Declared: Story = {
  args: { registration: declaredRegistration },
};

export const Verified: Story = {
  args: { registration: verifiedRegistration },
};

export const BothStates: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="declared">
        <RegistrationBadge registration={declaredRegistration} />
      </VariantRow>
      <VariantRow label="verified">
        <RegistrationBadge registration={verifiedRegistration} />
      </VariantRow>
      <StoryNote>
        Quill checks no register itself. Until an organisation admin has checked
        one by hand, the badge says &ldquo;Declared&rdquo; rather than implying
        more than happened.
      </StoryNote>
    </VariantStack>
  ),
};
