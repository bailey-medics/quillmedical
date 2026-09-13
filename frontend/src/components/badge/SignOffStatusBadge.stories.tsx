/**
 * SignOffStatusBadge Storybook Stories
 *
 * Demonstrates the SignOffStatusBadge component in all four states.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group } from "@mantine/core";
import SignOffStatusBadge from "./SignOffStatusBadge";
import { StoryNote, VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof SignOffStatusBadge> = {
  title: "Badge/Sign-off status badge",
  component: SignOffStatusBadge,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    status: {
      control: "select",
      options: ["requested", "signed_off", "declined", "superseded"],
      description: "Where the sign-off stands",
    },
  },
};

export default meta;
type Story = StoryObj<typeof SignOffStatusBadge>;

/**
 * Shows all four sign-off states.
 */
export const Default: Story = {
  render: () => (
    <Group gap="md">
      <SignOffStatusBadge status="requested" />
      <SignOffStatusBadge status="signed_off" />
      <SignOffStatusBadge status="declined" />
      <SignOffStatusBadge status="superseded" />
    </Group>
  ),
};

/**
 * Each state with a note on what it means, since the colours carry
 * meaning that is easy to read the wrong way round.
 */
export const States: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="requested">
        <SignOffStatusBadge status="requested" />
      </VariantRow>
      <VariantRow label="signed_off">
        <SignOffStatusBadge status="signed_off" />
      </VariantRow>
      <VariantRow label="declined">
        <SignOffStatusBadge status="declined" />
      </VariantRow>
      <VariantRow label="superseded">
        <SignOffStatusBadge status="superseded" />
      </VariantRow>
      <StoryNote>
        Declined is pink rather than red: an assessor saying &ldquo;not
        yet&rdquo; is an ordinary part of the record, not an error. Superseded
        is neutral because the record is still valid history, corrected by a
        later one.
      </StoryNote>
    </VariantStack>
  ),
};

export const Loading: Story = {
  render: () => <SignOffStatusBadge status="signed_off" isLoading />,
};
